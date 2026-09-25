# Frontend Rewrite (Steps 8 to 8c)

Date: 2026-09-24
Status: Proposed
Parent: `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`, "Step 8. Frontend rewrite."

## Purpose

The page is one hand-written `src/main/resources/pages/index.html`: Vue 2.6,
end of life since 2023, with Vue itself, Bootstrap 4, axios and feather-icons, four assets, loaded
from three public CDNs and no build step. The parent design's step 8 replaces it
with TypeScript, build tooling, components, a connection module and client
types checked against the server contract, then adds a theme and a responsive
layout. This document settles how, and splits the work in four:

- **Step 8, technical migration.** A new stack behind a page that behaves and
  looks the same.
- **Step 8a, connection.** The path decides the page, and the stream recovers
  on its own.
- **Step 8b, issue editor.** A cancel and a conflict notice.
- **Step 8c, UI/UX.** The redesign, on code already known to be correct. Its
  scope is open, from today's components restyled to the company's visual
  identity to new components and interactions, so its own spec decides whether
  it splits into further sub-steps.

All follow the parent design's branch naming:
`20260831.protocol_architecture_8_frontend_rewrite` now, with
`..._8a_connection` and `..._8b_issue_editor` stacked on it and merged in the
same delivery window, and `8c` branches under the same prefix later.

## Decisions and their reasons

**Four steps, stacked.** In one big change the page's behaviour and its tests
move together, so nothing independent says whether a difference is a bug or an
intended redesign. Holding behaviour and look still in step 8 keeps the
Playwright suite an honest judge of the migration, which matters because the
connection logic carries guarantees from steps 1 and 6. Each behaviour change
that needs design decisions then gets its own step, judged by its own new
tests. A first version kept the connection and editor changes as trailing
commits in step 8, declining a separate step as too small at under 200 lines
for its own merge round. That measured code when the cost was in decisions:
those two sections drew most of the review rounds. And a stack costs one
delivery window, not one per step, with a routine rebase after each merge. 8a
and 8b are independent, both built on step 8's store, and the connection goes
first. The cost is that step 8's markup is restyled in 8c.

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
`application.conf`'s identical default, so it was removed from the console,
confirmed absent from `clever env` on 2026-09-24. Step 8 then moves the default
in the same commit as the build that produces the file. The one console
change left is the build hook, timed in the rollout.

**The build order lives in a script, not in either tool.** Clever runs sbt
from source on each push, so a first design had sbt run npm while packaging.
It needed an install stamp, a bypass for `sbt run`, a Node check in sbt and
a packaging dependency that sbt does not order on its own, each only because
one tool drove the other. Clever's `CC_PRE_BUILD_HOOK` runs a repository
script before the build, which Clever documents for steps a build tool cannot
own, so the console holds one stable pointer and the steps stay reviewed in the
repo. A Docker runtime would also keep everything in the repo but needs a new
Clever application and a domain move, for a problem the hook already solves.

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

**The estimation becomes a tagged union on the wire.** The parent design's
section 2 deferred it here: `voted`, `hasEstimation` and `estimation` admit
eight combinations of which five are legal, and its three costs (a custom
encoder, the two `RoomSnapshotSpec` tests pinning today's shape, the Vue page's
six read sites) all disappear once the client is rewritten. The participant
field becomes one `estimation` tagged `NoEstimation`, `ConfirmedHidden`,
`Confirmed(value)`, `UnconfirmedHidden` or `Unconfirmed(value)`, carrying
`confirmed` so the re-vote state stays distinct. It is its own commit after the
strict contract test, so the wire change is reviewed as a contract diff. No
mixed-version window exists, since a deploy ends every session.

**Participants are listed alphabetically.** The parent design leaves the
snapshot's `users` order unspecified and gives step 8 the default, which
lands in step 8c since it changes the order the e2e suite reads. `view.ts`
sorts by name with `localeCompare` at base sensitivity, ignoring case and
accents, and breaks ties by user id. Clients already agree, since
`RoomSnapshot.of` sorts by id; the reason is readability, since a table sorted by
id reads as random. "Yourself first" was declined because a screen-sharer's
table would differ from everyone else's; by-vote orders stay with Phase 4.

**The revealed-round notice gets a live region.** The parent design's step 3a
section says step 8 owes it one; it lands in step 8c. Today the notice is
toggled with `visibility`, which hides it from screen readers, and a region
inserted with its text is not reliably announced. So one `role="status"` element is always rendered, empty
before the reveal and holding the sentence after it, and it carries the row's
reserved height itself, so the look is unchanged and Playwright sees it as
visible when empty. `role="alert"` stays refused, as the parent
records.

## Scope and sequencing

Step 8's commits, in order:

1. **Tooling.** Vite, TypeScript, React, zod, `mise.toml`,
   `clevercloud/build-frontend.sh`, CI's reordered steps, the page served from
   `frontend/dist/` with the `/assets/` route and the `503`, `index-path`
   defaulting there, and Vitest as `npm run test:unit` and ESLint with the React
   hooks rule.
   Today's page moves by `git mv` to `frontend/index.html`, so no copy survives
   to be served instead; Vite leaves its CDN tags alone. `testkit/app.js`'s
   `INDEX_PATH` moves to `frontend/dist/index.html`, and the `pretest` and
   `pree2e` hooks become `npm run build && npm run stage`, in the same commit,
   and `testkit/app.js` checks that `INDEX_PATH` exists beside its launcher
   check, failing with "Run: npm run build" rather than a 30 s readiness
   timeout. `DockerPlugin`, `dockerEnvVars` and `dockerBaseImage` leave
   `build.sbt`, since an image would now ship without the page and nothing
   builds one; `testkit/app.js`'s header stops citing Docker. `APISpec`'s index
   cases move to a temp fixture page, `ApiConfigSpec` asserts the new default,
   and the new `503` and `/assets/` cases land here too.
2. **Straight port.** Today's behaviour and markup, Bootstrap, icons and axios
   bundled instead of loaded from CDNs, `applySnapshot` carried over unchanged.
   axios comes from npm until commit 3 replaces it. The `e2e/fixtures.js`
   comments citing Vue (`v-if`, `inRoom`) credit the React mount.
3. **Contracts.** The OpenAPI document, `openapi-typescript` and
   `openapi-fetch` replacing axios, the regenerate-and-diff gate, and the strict
   snapshot contract test.
4. **Estimation union.** The custom Circe encoder, `RoomSnapshotSpec`'s two
   shape tests rewritten for the union, the zod schema and `view.ts` reading
   it, and a contract state for each of the five tags.

Step 8a's commits, in order: the path decides the page, including Leave
keeping the name where today's `doLeave` clears `localStorage` and a restored
page reloading, first, since the others build on it; close the old stream
before opening a new one; the watchdog with self-healing reconnect; the reload
on a refusal with the restart notice.

Step 8b: the issue editor's cancel and conflict notice, with `api.ts`'s 10 s
bound, whose one visible effect is the editor's.

Existing e2e cases steps 8a and 8b change, each in the commit whose behaviour
it pinned:

- **The path decides the page.** `slug.spec.js`'s "a room remembered from before
  the cutover reopens under its derived name" clicks the lobby's rejoin link
  (see Pages and navigation). The comments on `newTab` in `e2e/fixtures.js` and
  in `room.spec.js`'s "a straggler reloading leaves the votes hidden" stop
  crediting `created()` and credit `/<slug>` joining with the remembered name.
- **The issue editor.** `room.spec.js`'s "the issue box resyncs once the editor
  loses focus" is inverted in place into "a draft survives blur and room
  activity": same setup, the final assertion now expects the draft kept. The
  comments in "an edit committed with the check button reaches the other
  browser" and "a commit that never blurred the box still lets the room resync
  it" stop arguing from the focus guard the commit removes.

The pass condition for step 8 is the existing e2e suite green with at most
listed selector changes to the cases, beside the harness changes commits 1 and
2 list. Each commit in 8a and 8b brings a test shown failing against the
commit before it.

Step 8c: component library and look, light and dark theme, responsive layout,
alphabetical participant order, the revealed-round live region, the
frozen-deck tooltip step 3a declined, restyling the editor, placing the
participants list above the results, and a "Not Alice?" way to join under
another name than the remembered one. By default it restyles the earlier
steps' interactions and does not redesign them; its own spec may choose
otherwise, as a deliberate decision with a known cost.

Known issues this closes:

| Entry in `docs/known-issues.md` | Closed by |
| --- | --- |
| The page and the browser suite depend on three public CDNs at runtime | Step 8, commit 2, together with the CDN notes in `playwright.config.js`. The `assets` fixture in `e2e/fixtures.js` becomes a guard, installed on every context including those `join` creates, that fails any case whose page requests a host other than `127.0.0.1` |
| The issue editor has no cancel, and an unfocused draft is replaced by any room activity | Step 8b |
| A reveal with votes still pushes the participants list down | Step 8c, as a layout change |

## Frontend architecture

This is the architecture once step 8b lands. Step 8 builds the layers and
ports today's behaviour into them. Three layers, with dependencies pointing
only downward:

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
From step 8b, it aborts any request unanswered after 10 s, the liveness fetch's bound, so a
dead network ends in a failure rather than a request left hanging.

**Room state** (`frontend/src/room/`), with no React import. `connection.ts`
owns the stream: the page's connection id, the `EventSource`, close-before-open,
the watchdog, the liveness fetch and reload on a refusal, the leave beacon and the
`pagehide`, `pageshow` and `visibilitychange` listeners. It exposes a store of
`{ lost: boolean, fatal: boolean, snapshot }` through `subscribe` and
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
as the next snapshot. Nothing updates optimistically except the saved issue
text (see Issue editor behaviour).

**Not added:** a router library (the path is read once at startup:
`/<slug>`, `?moved=1` and `?restarted=1`), a state library, CSS-in-JS.

**Layout.** `frontend/` at the repo root holds `index.html`, `src/`,
`vite.config.ts` and `tsconfig.json`. There is one root `package.json`, shared
with Playwright, so Clever, CI and a laptop run one `npm ci` against one
lockfile. Playwright's browsers are a separate download, which keeps Clever's
install light.

**Keeping the look in step 8.** Bootstrap from npm at 4.6.2, the last 4.x
release, in place of the CDN's 4.4.1. `.github/dependabot.yml` ignores
Bootstrap's major versions until 8c, in the commit that adds it, since
Bootstrap 5 would break the frozen look. feather-icons becomes `lucide-react`,
Feather's maintained continuation, with Lucide's equivalents of the five icons
in use (`check`, `check-circle`, `edit-2`, `lock`, `shield-off`), sized to
today's 20px rather than Lucide's default 24. The look is checked side by
side, not by pixel baselines: a throwaway Playwright script, not committed,
captures the lobby and a room before and after a reveal at one viewport, run at
commit 1 (today's page) and at commit 4, and both sets go in the PR with Lucide's
redrawn icons noted as the expected difference. Pixel baselines were rejected:
the slug differs every run, baselines differ by platform and browser, and
commit 2 changes the icons on purpose, so they would need masking, a Docker
image in CI and a re-baseline for a test deleted three commits later. The
reveal notice's bounding-box case in `room.spec.js` keeps guarding layout.

## Build, serving and the dev loop

**Two builds, one order, and neither tool calls the other.** `npm ci` and
`npm run build` write the page to `frontend/dist/`; `sbt stage` builds the
server and knows nothing about npm. Whatever runs them runs the frontend first:

| Where | How |
| --- | --- |
| Clever | `CC_PRE_BUILD_HOOK=./clevercloud/build-frontend.sh`, which Clever runs before its usual `sbt stage`, failing the deploy if the script fails. The script is `npm ci --include=dev --prefer-offline --no-audit --no-fund --fetch-timeout=60000 && npm run build`, CI's flags, whose comment records the 300 s audit stall |
| CI | `jdx/mise-action` in place of `setup-node`, installing from `mise.toml`, then `./clevercloud/build-frontend.sh` itself, then `sbt qa`, then the node and browser suites, so the deploy script is run on every push before production first runs it |
| A laptop | See the dev loop below |

`frontend/dist/` is gitignored and sits outside `target/`, so `sbt clean` leaves
it alone. `--include=dev` keeps the build working if `NODE_ENV=production` is
ever set. `Universal / mappings` gains nothing: the app runs with the checkout
as its working directory, the way today's `src/main/resources/pages` path is
found, and no zip or Docker build is produced. `probe.html` and its mapping are
untouched.

**Node is pinned in `mise.toml`.** Clever runs `mise install` before the build
on every runtime, putting the pinned Node on the build's `PATH`; `mise` 2026.6.14
and Node 24.21.0 were on the instance by `clever ssh` on 2026-09-24. CI
installs from the same file with `jdx/mise-action`, since `setup-node`'s
`node-version-file` does not read `mise.toml`, and a laptop can use `mise install` or any
Node of that major. A syntax error in `mise.toml` fails the deploy with a
misleading message, so the file stays a single `[tools]` line.

**Serving.** `ApiConfig.indexPath` defaults to `frontend/dist/index.html` and
keeps `PageRoutes`' `no-cache` revalidation. A new `/assets/` route serves
Vite's content-hashed files with `Cache-Control: public, max-age=31536000,
immutable`; a file's name changes with its content, and the revalidated page
names the new files after a deploy. It reads the `assets/` directory beside
`index-path`, so the one setting locates both and an override such as
testkit's `INDEX_PATH` cannot serve a page without its scripts. Step 7's route
hazard is closed two ways: Vite emits everything under `/assets/`, two
segments deep where `PageRoutes`' `path(Segment)` cannot match; and there is no
`frontend/public/`, so nothing is emitted at the root.

**A missing page answers `503`.** When the `index-path` file does not exist,
`/` and `/<slug>` answer `503` with "The page is not built: run `npm run
build`", and startup logs the same. With no `CC_HEALTH_CHECK_PATH` set,
Clever's deploy check requests `/` and accepts only 200 to 499 (its "Health
Check" reference page), so a deploy without a page fails and the previous
instance keeps serving, while `sbt run` still starts for backend work.

**Generated API types.** An sbt task writes tapir's OpenAPI document to
`frontend/src/protocol/generated/openapi.json`, adding `tapir-openapi-docs`;
`npm run gen:api` runs `openapi-typescript` into `openapi.d.ts`. Both are
committed, so Clever's build needs no generation step, and CI regenerates them
and fails on `git diff`.

**Snapshot contract test.** A Scala test builds snapshots through
`RoomSnapshot.of` and the production encoder for representative states (before
the reveal with the reader's own estimate, after the reveal, an empty issue,
and from commit 4 one per estimation tag)
and writes them to `target/contract/`, emptying it first so a removed state
leaves no file behind. A Vitest test parses each with the strict
schema, and fails with "run sbt test first" when the files are absent rather
than passing on nothing. CI's `sbt qa` already runs before it.

**CI additions.** `tsc` in strict mode, ESLint with the React hooks rule,
Vitest as `npm run test:unit`, and the regenerate-and-diff check. Vitest's
config sets its include to `frontend/src`, so it never picks up `e2e/` or
`test/`. Vitest gets
its own script because `npm test` stays `node --test` behind a build and
stage pre-hook that unit tests do not need. This edits
`.github/workflows/ci.yml`, which the `gh` token cannot merge, so the PR is
merged in GitHub's interface.

**Dev loop.** Two terminals, one per tool. For page work, `SECURE_COOKIES=false
sbt run` and `npm run dev`, then open Vite's address: it serves the page from
source with hot reload and forwards `/rooms` and `/create-room` to port 8080,
SSE included, so the browser sees one origin and the cookie works. `/<slug>`
works because Vite serves the page for unknown paths; the not-a-room page and
the UUID redirect are not reproduced there, and the e2e suite covers them
against the staged app. Nor is the liveness fetch's wait: Vite answers `/<slug>` itself
with sbt down, so the page reloads, and the e2e case against the stub covers it. For backend work, `npm run build` once and `sbt run`
alone on port 8080, as today. A combined `npm run dev:all` is left until
someone asks for it.

## Pages and navigation

Step 8a. Step 8 keeps today's startup, ported, which rejoins the remembered
room even on `/`.

The URL is the only thing that decides what the page shows, and every change of
room is a page load:

| Path | Shows |
| --- | --- |
| `/` | The lobby, always: Create and Join, the remembered name prefilled, and "Rejoin brave-golden-otter as Alice" when a room is remembered |
| `/<slug>` | The room. With a remembered name it joins at once; without one, the join form with the slug fixed. Invalid slugs and legacy UUIDs keep the server's not-a-room page and `?moved=1` redirect |
| `/<slug>?restarted=1` | The room, with a dismissible "Reconnected. Please check your vote." notice, true whether the room restarted or survived a transient refusal, `role="status"` like `movedBanner` so the `alert` selector never matches it, cleared from the address like `?moved=1` |

Create and Join store the name, then go to `/<slug>` with the typed slug
passed through `encodeURIComponent`. The room is remembered when the page first
receives its snapshot, so an unreachable typed name is never offered back and a
shared link that joins becomes the remembered room. A stored room that is not a
slug, from before the cutover, is offered as "Rejoin your last room as Alice".
Leave closes the
stream, sends the leave beacon, forgets the room but keeps the name, and goes
to `/`. Back from `/` therefore reloads `/<slug>` and rejoins (a back/forward
cache restore reloads too), which is where
the user was. Step 7's "a room remembered from before the cutover reopens
under its derived name" in `e2e/slug.spec.js` relied on `/` rejoining, so it
changes to clicking the lobby's rejoin link, which reaches the server's UUID
redirect; that change is listed in the PR.

Two costs are left open. A shared link opened with someone else's name
remembered joins as them, as today; a "Not Alice?" affordance belongs to step
8c. A mistyped but valid slug creates an empty room, since `/join` creates any
valid slug; that is a server question, already recorded in
`docs/known-issues.md` as "An unrecognized `roomId` silently creates an empty
room".

**Why.** Today `created()` rejoins the remembered room even on `/`, so a bare
`/` opens a room from days ago, recreated empty, and after Create the address
still reads `/`. Making the path decide gives startup one rule and a URL that
always names the room shown. Because the page never changes rooms in place, no
frame can put it back into a room it left, with no terminal state, one-shot
`entering` flag or router to maintain. The cost is a page load on create, join
and leave, unnoticed on a laptop and up to a second on a weak phone connection.

## Connection behaviour

Step 8a. Until it lands, step 8 keeps today's connection code, ported.

A failed stream has two recoveries, and each failure maps to one:

| What happened | Noticed by | Action |
| --- | --- | --- |
| The stream went quiet: a network drop, a sleeping laptop, a suspended phone tab | Nothing heard for 35 s | Reopen with the same connection id |
| The stream was refused, usually because the room is gone (a deploy, a crash, an idle stop); a transient proxy error on a live room reloads harmlessly too | `onerror` with `readyState` CLOSED, then `GET /<slug>` answering `200` | Reload to `/<slug>?restarted=1`, which rejoins |

- **One watchdog** decides from the stream alone: CLOSED, it runs the liveness
  fetch; stale, it reopens; otherwise it does nothing. It runs on `onerror`, on
  a 5 s tick and on `visibilitychange` to visible, so a failed fetch is
  simply retried on the next run. The tick sets how long detecting silence
  takes, 35 to 40 s, and how soon every tab is back once the app answers after
  a deploy. Reopening only when stale matters because tab
  switches are frequent and each reopen is a Join published to the room.
- **A closed stream is never reopened.** `EventSource` reaches CLOSED only on
  an error response or the page's own `close()`; a network drop leaves it
  CONNECTING and the browser retries by itself. So CLOSED means a refusal, or
  a Leave that must stay closed.
- **A closed stream gets a liveness fetch before any reload.** `EventSource`
  closes on any error response, and a proxy in front of a stopped app answers
  one too (the testkit stub's `502`, Clever's and Vite's proxies). So a CLOSED
  stream first fetches `/<slug>`: a `200` comes only from the running app, so
  the refusal is real and the page reloads, or shows the message below if it
  never reached the room; any other answer or a network error means the app is
  down, and the next run of the watchdog fetches again. One fetch runs at a
  time, each bounded by a 10 s timeout, so a fetch hung on a proxy is abandoned
  and the next run tries again.
- **A back/forward cache restore reloads.** `pageshow` with `persisted` reloads
  the page, so a restored page is a fresh load like every other way into a
  room, including Back after Leave.
- **Nothing runs while `fatal` or once the page is navigating**, for Leave or a
  pending reload, so no watchdog run or fetch races a page load.
- **One banner**, "Connection to the room was lost", shows after any `onerror`
  or 35 s of silence, and clears on the next `onopen` or frame, as today. The
  browser's own retry on the server's `retry` interval keeps running under it.
  `fatal` hides it, since the message says more.
- **Frames.** A heartbeat (empty frame), a snapshot and a reopen all record
  "last heard from", so a reopened stream gets a full 35 s before it is
  judged. A snapshot is parsed with zod: valid, the store updates; invalid,
  logged and dropped.
- **Reload only after reaching the room.** When the liveness fetch answers
  `200` on a page load that never received a snapshot, the page shows "Your
  session has ended. Please reload the page to rejoin." instead of reloading
  and sets `fatal`, so a stream refused every time, such as a `SECURE_COOKIES`
  mismatch, cannot loop. Fetching first means a page caught by a deploy shows
  it only once the app answers, so the reload it asks for works.
- **`pagehide`** sends the leave beacon while a stream is open, whether or not
  the page enters the back/forward cache: a restore reloads and rejoins, so
  today's exception for a cached page has nothing left to protect. Leave closes
  the stream first, so it is sent once.

**Why reload on a refusal.** The parent design gives step 8's connection module
the rejoin under the remembered name, and a reload already is one: `/<slug>`
with a remembered name joins, `/join` recreates a valid slug that no longer
exists (`RoomManager`'s `RequestSession`), and one-at-a-time handling there
means only the first tab creates it. A refusal means the room is gone, not the
member: `Room` keeps sessions past the grace period, and "a disconnection
outlasting the grace period comes back without a reload" covers that. Reloading
rather than rejoining in place means the page always runs the server's own
build, which the strict contract assumes. The liveness fetch means the reload
waits until the app answers, so it never lands on a proxy's error page.

**Accepted.** A room that crashes on something sent right after a join makes
every tab reload in a loop, since each load reaches the room. It needs a server
bug and is loud rather than silent, so no reload budget guards it.

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
timer to fire on time, which is also what makes the run on `visibilitychange`
work. The tick only samples the clock, so throttling delays a check but never
distorts it. The 35 s is twice `SSE.heartbeatInterval` (15 s) plus a margin; the
constant in `connection.ts` and `SSE.heartbeatInterval` each name the other.

## Issue editor behaviour

Step 8b. Until it lands, step 8 keeps today's focus guard, ported.

Today the only protection for a draft is keyboard focus: every snapshot writes
the room's issue into the box unless the editable input is focused. Losing
focus, including alt-tabbing to copy a ticket title, lets the next room activity
replace the draft, and the only exit from edit mode is the check, which posts
whatever the box holds. Guarding the whole of edit mode was rejected at step 1
because, without a cancel, a user who opened the editor and clicked away would
silently stop receiving issue updates. A cancel and a conflict notice remove
that objection, so step 8b guards the whole of edit mode.

`useIssueEditor` holds the logic and `IssueEditor` the markup; step 8c
rewrites only the markup. Below, the room's issue is the store's, except once
a save succeeds: the saved text, until the store's issue differs from what it
held when saving began.

| State | Shows | Transitions |
| --- | --- | --- |
| viewing | The room's issue, read-only, with a pencil | Pencil: to editing, with draft and starting point both set to the room's issue |
| editing | The draft, editable. While the room's issue differs from both the starting point and the draft, also "Changed by someone else to: X" and "Use theirs" | Enter or check: to saving. Escape or cancel: to viewing, draft dropped. "Use theirs" sets draft and starting point to X; saving overwrites X knowingly |
| saving | The draft, read-only | POST fails: to editing, draft kept, "Could not save the issue" until the next Enter, check, Escape or cancel. POST succeeds: to viewing |

**Why the saved text waits for a different issue.** `Room` replies `Applied` and
publishes while handling the same message, so a completed POST means the room
holds the value, but the SSE frame carrying it can reach the browser before or
after the HTTP response. Returning to snapshots at once would flash the old
text. A frame published before the edit carries the issue as it was when saving
began, so ignoring that value and nothing else hides every stale frame and shows
the edit, or any later one, as soon as it arrives. The condition is read from
the store, so a frame that beat the response ends the wait at once. Two cases
are accepted. An edit applied just before this one, whose frame arrives
after the response, shows briefly before this one replaces it. And a page whose
own frame never arrives, lost with its stream, keeps showing its text if
someone then restores exactly the previous issue, until the issue next changes.

This also removes both narrow windows the parent design recorded for the focus
guard, the blur landing before the commit click and the revert during the save
round trip, along with `issueFocused` itself.

## Error handling

Join, create and the not-a-room redirect keep today's messages and behaviour.
A request `api.ts` aborted after 10 s is a failure like any other.
Show, clear, re-vote and vote failures keep today's console-only logging: a
refused command changes nothing visible, and the next snapshot is the truth.

## Testing

Each case below lands with the step whose behaviour it pins.

- **The existing e2e suite, in Chromium and Firefox, is the judge of step
  8.** The port keeps Bootstrap's markup and class names, so the suite
  should pass unchanged, CSS-class selectors included (`tbody tr`,
  `.estimation-button-selected`, `#join-roomId`). Any selector change is listed
  in the PR with its reason. Moving those to role-based selectors belongs to
  step 8c, where the markup changes.
- **The off-origin guard.** From commit 2, one helper in `e2e/fixtures.js`
  installs the guard on every browser context the suite opens: the `context`
  fixture's and each one `join` creates with `browser.newContext`. It routes
  only a URL predicate, `url => url.hostname !== '127.0.0.1'`, so same-origin
  traffic (the stub, the app, `/events` streams) never passes through the
  runner. A matched request is aborted and recorded, and the fixture fails the
  case if anything was. A guard on `context` alone would miss every page
  `join` opens and still pass. It fails against
  commit 1, whose page still loads the CDNs, and keeps "no CDN request" true
  after later dependency changes.
- **New e2e cases**, each shown failing against the commit before it:
  - A stream frozen by a new stub `freeze(match)` mode, which keeps the live
    stream sockets open, forwards nothing and lets new requests through: the
    banner after 35 s, the page reopening on its own, the next vote arriving.
    It runs under `test.setTimeout(90_000)` since the 15 s heartbeat is fixed.
    `stub.cut()` fires `onerror` and `setOffline` differs by browser on an open
    stream, so neither reaches the watchdog.
  - `/` showing the lobby with a rejoin link rather than joining, and clicking
    it reaching the room; Create, Join and Leave changing the address; Leave
    keeping the name prefilled.
  - A session ended by restarting the app: the page rejoining the recreated
    room under its name with the restart notice, `?restarted=1` cleared from
    the address, and the notice dismissible.
  - The same with the app down for a few seconds behind the stub: the page
    waiting under the banner rather than reloading onto the stub's `502`.
  - A refused stream on a page that never reached the room: the message, no
    reload and no further `/events` request.
  - The reveal's live region, found by name within the round rather than by
    `getByRole('status')` alone, since the moved banner and the restart notice
    are also status: present and empty before a reveal, holding the notice
    after it.
  - The editor: a draft surviving blur and room activity (the inverted case
    above); Enter saving and Escape cancelling; cancel restoring the room's
    issue; a concurrent change showing the notice; "Use theirs"; saving over a
    concurrent change. These find elements by role and name, so step 8c's
    restyle does not break them.
- **The Scala specs need no built page.** `APISpec`'s index cases write a
  fixture page to a temp file and build `ApiConfig` with it, since sbt's tests
  must not depend on npm having run. `ApiConfigSpec` asserts the new default.
  New `APISpec` cases go through `API.route`: `/` and `/<slug>` answering `503`
  with the message when the page file is missing; an `/assets/` file served
  with the `immutable` header from beside `index-path`; and a missing asset
  answering `404`.
- **Vitest unit tests** in `frontend/src/**/*.test.ts`: `connection.ts` with a
  fake `EventSource` and fake timers, covering close-before-open, both rows of
  the connection table, a closed stream with a failing liveness fetch retrying
  without reloading, no second liveness fetch while one is in flight, a hung
  one abandoned after 10 s, a refused stream and Leave's close never reopened,
  a `persisted` `pageshow` reloading, a `persisted` `pagehide` sending the
  beacon, the watchdog's three triggers, heartbeats
  alone keeping the stream fresh past 35 s, a reopen not repeated before
  another 35 s of silence, an invalid snapshot leaving the store unchanged, no
  watchdog run or liveness fetch once navigating or `fatal`, the banner hidden
  while `fatal`, and the reach-the-room rule; `view.ts`, including
  name order ignoring case and accents with the id tie-break; every
  `useIssueEditor` transition, including the saved text ignoring a stale frame,
  ending on a frame that beat the POST response and on someone else's later
  edit, the pencil opening the saved text, and no notice after a failed save
  the room applied; `api.ts` aborting a request after 10 s; the strict
  contract test. They do not overlap `node --test`'s `test/` folder, and
  CI runs both.
- **The stub's `freeze`** gets a case in `test/stub.test.js`: sockets held open,
  nothing forwarded, new requests let through.

## Docs in the same PR

Each step's PR carries its own:

- **Step 8.** `README.md`: `mise.toml`'s Node, or any Node of that major; both
  dev modes, the two-terminal page loop and `npm run build` before `sbt run`
  alone; `npm run test:unit`; asset caching; the page path now owned by
  `application.conf`; the pre-hooks now build, then stage.
  `docs/known-issues.md`: remove the CDN entry; move the citations of entries
  that point into today's `index.html` ("A reveal with votes still pushes the
  participants list down", "A tied vote is broken by JavaScript key order", "A
  Show during a partial re-vote") to the symbols that replace them.
  `docs/roadmap.md`: tick Phase 3's migration items, leaving appearance to 8c,
  and reword "tentatively Vue 3, framework choice still open" to React. The
  parent design: step 8's "Landed" paragraph, which each later step extends.
  The pointers from its step 8 section and its contract test to this document
  land with this document.
- **Step 8a.** `docs/known-issues.md`: amend "An unrecognized `roomId` silently
  creates an empty room" for the lobby, where a mistyped but valid room name
  now opens a new empty room; add to "A second tab on the same room displaces
  the first tab's identity" that the reload on a refusal makes its two-tab race
  routine at every restart, since both tabs POST `/join` with a stale cookie
  and each mints a session. `docs/roadmap.md`: tick the backlog's
  connection-liveness watchdog, noting that a persisted `pageshow` reloads
  rather than arming it.
- **Step 8b.** `docs/known-issues.md`: remove the editor entry.

## Rollout

The stack of 8, 8a and 8b merges in one delivery window outside working hours,
since each merge restarts the server and ends every live room.

1. ~~Remove `INDEX_PATH` from the Clever console.~~ Done: absent from
   `clever env` on 2026-09-24.
2. Set `CC_PRE_BUILD_HOOK=./clevercloud/build-frontend.sh` just before merging
   step 8: set earlier, a deploy of the old `main` fails on the missing script,
   which is safe but noisy.
3. Merge step 8 in GitHub's interface, because of the `ci.yml` change. Rebase
   8a onto `main`, wait for CI, merge it; the same for 8b. Clever redeploys on
   its own after each.
4. Read step 8's deploy log for `mise install`, the hook's `npm ci` and Vite
   lines, then `sbt stage`, in that order.
5. Once 8b is deployed, test by hand with five participants on four devices: a
   desktop, a dev VM, a Mac laptop in Safari and in Firefox, and an Android
   phone. Safari and a real phone are what the e2e suite never runs. Each
   check names the step it judges, so a failure points to one.
   - Step 8: vote, re-vote, show and clear; reload one tab repeatedly, and
     close another.
   - Step 8a: restart the app from Clever's console while in a room: every
     participant comes back with the restart notice. Take one browser offline
     in devtools for about a minute: the banner shows, then clears on return.
     Lock the phone, or switch apps, for a minute: the room is current on
     return. On the phone, switch apps and back within 3 s, inside the 6 s
     grace period: the other browsers never show it leaving, so no `pagehide`
     fired.
   - Step 8b: edit the issue, save and cancel; edit it in two browsers at
     once: the second to save sees the conflict notice.

**Rollback**, if step 5 fails, reverts the failing step and those above it:

1. For step 8 itself, remove `CC_PRE_BUILD_HOOK`, since the commit before it
   has no script.
2. Redeploy the last good step's merge commit with `clever restart --commit
   <sha>`, checked against Clever's CLI docs before the rollout. No wait for
   empty rooms is needed, since a broken page has none.
3. Revert the failing steps on `main` unless the fix lands the same day. It is
   not yet known which commit Clever builds when it restarts the application
   on its own; if it takes `main` after step 8 is reverted, that build fails
   without the hook, which is harmless while an old instance serves and an
   outage when none does.

## Done when

For each step: the e2e suite is green, unchanged for step 8 except the listed
selector changes, and with the listed behaviour changes for 8a and 8b; the new
e2e and unit tests pass and were shown failing first; `tsc`, ESLint and the
regenerate-and-diff gate are green; and its docs above are updated. Step 8
also has the off-origin guard in place.
