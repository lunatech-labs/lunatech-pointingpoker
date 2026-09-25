# Step 8: Frontend Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-written Vue 2 page with a Vite, TypeScript and React build that behaves and looks the same, with client types checked against the server contract and the estimation sent as a tagged union.

**Architecture:** Three layers under `frontend/src/`, with dependencies pointing only downward: `protocol/` (the zod snapshot schema, the generated API types, the typed client), `room/` (the connection store and the view derivation, plain TypeScript with no React import) and `components/` (React, the view layer only). The server serves the built page from `frontend/dist/` and its content-hashed files from a new `/assets/` route, and answers `503` when the page is not built. A repository script builds the page before sbt runs, on Clever and in CI alike.

**Tech Stack:** Scala 3.9.0 with `-Werror`, Pekko HTTP 1.4.0, tapir 1.13.31 with `tapir-openapi-docs` and sttp-apispec 0.11.10, circe 0.14.16, ScalaTest 3.2.20; Node 24.21.0 through `mise`; Vite 8.3.1, TypeScript 5.9.3, React 19.3.0, zod 4.6.5, Vitest 5.0.2, ESLint 10.11.0 with typescript-eslint 8.70.1 and eslint-plugin-react-hooks 7.1.1, Bootstrap 4.6.2, lucide-react 1.48.0, openapi-typescript 7.13.0, openapi-fetch 0.17.0; Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-09-24-frontend-rewrite-design.md`, the sections "Scope and sequencing" (step 8's four commits), "Frontend architecture", "Build, serving and the dev loop", "Testing" (the cases that name step 8), "Docs in the same PR" (step 8) and "Done when". Steps 8a, 8b and 8c are out of scope for this plan.

## How the code in this plan was verified

Every code block below was compiled and run in throwaway spaces before it was written down, on 2026-09-25:

- **The frontend, end to end.** Tasks 2 to 5's code was assembled in a scratch worktree with Task 1's server changes, and `npm run typecheck`, `npm run lint` and `npm run test:unit` all passed. The unchanged e2e suite passed 70 of 70 in Chromium and Firefox, once with the axios `api.ts` (Task 4's state) and once with the `openapi-fetch` one (Task 5's state).
- **Teeth.** The off-origin guard failed a `page` case and a `join` case when one CDN stylesheet was added to the page. The trim case in `e2e/lobby.spec.js` failed without the trim. The connection id fallback test failed when the fallback threw. The `503` and immutable-header cases each failed with their mechanism removed.
- **The Scala.** The OpenAPI generation built under `-Werror` with 206 tests green and gave byte-identical output across two runs. The serving changes gave 211 tests green. Tasks 6 and 7's Scala was verified the same way (see their tasks).

## Decisions this plan takes that the spec does not settle

Each is a recommendation that the plan implements as written unless review changes it. Task 9 records the ones that belong in the design.

- **D1. Seven commits, not four.** The spec lists step 8's commits as tooling, straight port, contracts and estimation union. The user's slicing rule is to slice by how each part is judged, and three of those commits hold two parts judged differently. So each splits in two, keeping the spec's order:
  - Tooling splits into the server's serving changes (judged by `APISpec`) and the node toolchain with the page move (judged by the unchanged e2e suite against today's page).
  - The straight port splits into the room state (judged by its unit tests) and the components (judged by the e2e suite).
  - Contracts splits into the typed client (judged by `tsc` and the regenerate gate) and the strict contract test (judged by itself).

  The estimation union stays one commit.
- **D2. TypeScript stays on 5.9.** npm's latest are 6.0 and 7.0, but `openapi-typescript` 7.13 declares a `typescript: ^5.x` peer and typescript-eslint 8.70 declares `<6.1.0`, so `npm ci` would refuse 6 and 7. The pin is `~5.9.3`, and Dependabot ignores TypeScript majors in the same commit, with the reason beside it.
- **D3. Endpoint descriptions move to an `Endpoints` object.** They were private members of `class API`, which needs an actor system, so nothing could interpret them for documentation. `Endpoints` holds the nine endpoint descriptions and their codecs, and `API` keeps the server logic. The generator is a `@main` in test sources, run by a `genOpenApi` alias, so `tapir-openapi-docs` and `openapi-circe` are `Test` dependencies and ship in nothing. tapir derives operation ids such as `postCreate-room`, which `openapi-fetch` never reads because it is keyed by path, so they are left alone.
- **D4. The zod schema lands with the room state (Task 3), both exports included.** The port needs the snapshot type, and the lenient runtime parse replaces today's bare `JSON.parse` with the same outcome for a bad frame: logged and dropped. The strict export is the same builder, so it lands with its unit test there, and Task 6 adds the contract test that consumes it.
- **D5. `api.ts` is a facade with stable signatures.** Task 3 writes it over axios, and Task 5 rewrites its body over `openapi-fetch` without changing a signature, so no component changes in Task 5. Every call rejects on a failure, so a component's `catch` stays the one place a failure lands, as it is with axios today.
- **D6. No `StrictMode`.** Its development-only double effect would run the startup join twice, and before step 8a's close-before-open the second one opens a second stream. Step 8a can add it once the connection closes the old stream first.
- **D7. The connection gets its browser APIs injected.** `createConnection` takes `openStream`, `sendBeacon` and the connection id, and exposes `pageHide(persisted)`, which `main.tsx` wires to `pagehide`. So Vitest runs it in node with a fake stream, and no DOM library is added.
- **D8. The ported focus guard folds snapshots during render.** `applySnapshot` keeps its `prev` input as the spec requires. The `Room` component stores the last snapshot it saw and folds a new one into its view state during render, React's "adjusting state when a prop changes" pattern. An effect would render one frame with the new snapshot and the old view, and react-hooks 7 flags setting state in an effect.
- **D9. The wire estimation is `{"type": ..., "value": ...}`.** `value` is present on `Confirmed` and `Unconfirmed` only, so a withheld estimate has no key to leak through. `view.ts` reads the union into the row fields the table already renders, so Task 7 touches no component.
- **D10. `RoomSpec` and `SSESpec` read the union through test-only extensions.** `voted`, `hasEstimation` and `shown` in `RoomDataFixtures` keep the contract change's review on `RoomSnapshotSpec`, whose cases are rewritten against the tags. Those two specs test room behaviour, not the wire shape.
- **D11. CI keeps an npm cache.** `setup-node`'s `cache: 'npm'` goes with `setup-node`, so an `actions/cache` step on `~/.npm`, keyed by the lockfile, replaces it.
- **D12. The missing-page check runs per request, and startup logs it at WARN.** A page built while `sbt run` is up is then served without a restart, and WARN rather than ERROR because backend work without a page is a supported mode.
- **D13. ESLint lints `frontend/` only**, with typescript-eslint's parser and react-hooks' recommended flat config and no other rule set, since the spec names only the hooks rule.
- **D14. Two new e2e cases in `e2e/lobby.spec.js`,** for the lobby paths the `join` fixture never takes: Enter in the name field, and a room name pasted with spaces. They pass on today's page too, so they are characterization cases, and each is shown failing by removing its mechanism.

Accepted differences in the port, listed in the PR:

- The issue editor's edit mode resets on Leave, since `Room` unmounts. The Vue page kept `editing` across a leave and a rejoin.
- A lobby error clears when a join succeeds. The Vue page cleared it in `onopen` a few milliseconds later.
- Vite minifies the stylesheet, and Bootstrap is 4.6.2 rather than 4.4.1.
- Lucide's icons are redrawn Feather icons, the expected difference in the look comparison.

## Global Constraints

- Branch: `20260831.protocol_architecture_8_frontend_rewrite`, already carrying the spec commits (last `dfd8b36`). Work on it directly. Steps 8a and 8b stack on it later.
- Node: `mise.toml` is exactly one `[tools]` table with one line, `node = "24.21.0"`, since a syntax error there fails Clever's deploy with a misleading message.
- `clevercloud/build-frontend.sh` runs `npm ci --include=dev --prefer-offline --no-audit --no-fund --fetch-timeout=60000` then `npm run build`, and its comment records the 300 s audit stall.
- The page is served from `frontend/dist/`, which is gitignored and outside `target/`. `index-path` defaults to `frontend/dist/index.html`. `/assets/` answers with `Cache-Control: public, max-age=31536000, immutable` from the `assets/` directory beside `index-path`. A missing page answers `503` with "The page is not built: run `npm run build`".
- There is no `frontend/public/`, and Vite's `publicDir` is off, so nothing is emitted at the root where the slug route matches.
- Bootstrap stays on 4.x until 8c, with Dependabot ignoring its majors. Icons are Lucide's `Check`, `CircleCheck`, `Pencil`, `Lock` and `ShieldOff` at `size={20}`.
- The room state (`frontend/src/room/`) imports nothing from React.
- `npm test` stays `node --test`; Vitest is `npm run test:unit`, with its include limited to `frontend/src`.
- The e2e suite is the judge of the port: it passes with **no selector changes** (the dry run needed none). Any change to an existing case beyond the comments this plan lists is a finding to report, not a fix to make quietly.
- `scalacOptions += "-Werror"` is on for `Compile` and `Test`. `.scalafmt.conf` has `project.git = true`: **`git add` every new Scala file before `sbt scalafmtAll`**.
- CI runs `sbt qa`, `sbt styleCheck`, `npm test`, `npm run e2e`, and from this step `npm run typecheck`, `npm run lint`, `npm run test:unit` and the regenerate gate. All must be green at the end.
- The PR edits `.github/workflows/ci.yml`, which the `gh` token cannot merge, so the user merges it in GitHub's interface. Do not merge, push to `main`, or touch the Clever console; the rollout is the user's.
- Code comments are one or two lines, never more. Documents contain no em dash. Commits use Conventional Commits and carry no Claude Code attribution line. In docs, cite symbols, not line numbers.

## Review Focus

- **A path that climbs out of `/assets/`.** A person expects `/assets/..%2Findex.html` and `/assets/%2e%2e/index.html` never to serve anything but an asset. The spike found that Pekko collapses `%2e%2e` before routing, so that request reaches the slug matcher, not the assets route. Task 1 asserts neither returns the page.
- **`sbt run` for backend work with no page built.** A person expects a clear message rather than a blank `404` or a crash. Task 1 asserts the `503` body on `/` and on `/<slug>`, and the WARN at startup.
- **A frame from a newer server carrying a field this page does not know.** A person expects the room to keep working. Task 3 asserts the connection stores the snapshot without the field.
- **A page served over plain HTTP, where `crypto.randomUUID` is missing.** A person expects to join and leave as usual. Task 3 asserts the fallback mints valid, distinct version 4 ids, beside the existing e2e case.
- **The lobby's keyboard and paste paths.** A person expects Enter in the name field to create or join, and a pasted room name with spaces to still join. No existing case takes either path, since the `join` fixture clicks. Task 4 adds `e2e/lobby.spec.js`.

---

## File Structure

| File | Responsibility |
|---|---|
| Modify `src/main/scala/com/lunatech/pointingpoker/PageRoutes.scala` | `503` without a page, `/assets/` with the immutable header, the startup WARN |
| Create `src/main/scala/com/lunatech/pointingpoker/Endpoints.scala` | The nine tapir endpoint descriptions and their codecs, with no server logic |
| Modify `src/main/scala/com/lunatech/pointingpoker/API.scala` | Server logic over `Endpoints` |
| Modify `src/main/scala/com/lunatech/pointingpoker/actors/RoomSnapshot.scala` | The `Estimation` union and its encoder |
| Create `src/test/scala/com/lunatech/pointingpoker/OpenApiDocs.scala` | `writeOpenApi`, the generator the `genOpenApi` alias runs |
| Create `src/test/scala/com/lunatech/pointingpoker/actors/SnapshotContractSpec.scala` | Writes representative snapshots to `target/contract/` |
| Modify `APISpec.scala`, `ApiConfigSpec.scala`, `RoomSnapshotSpec.scala`, `RoomDataFixtures.scala`, `RoomSpec.scala`, `SSESpec.scala` | As each task says |
| Modify `build.sbt`, `src/main/resources/application.conf` | Docker gone, OpenAPI test deps and alias; the new `index-path` |
| Create `mise.toml`, `clevercloud/build-frontend.sh`, `eslint.config.js` | Node pin, the build script both Clever and CI run, lint config |
| Modify `package.json`, `package-lock.json`, `.gitignore`, `.github/workflows/ci.yml`, `.github/dependabot.yml` | Scripts and dependencies, `frontend/dist/`, the reordered CI, the major-version ignores |
| Move `src/main/resources/pages/index.html` to `frontend/index.html` | Today's page, built by Vite in Task 2, replaced by the React mount in Task 4 |
| Create `frontend/vite.config.ts`, `frontend/tsconfig.json` | Build, dev proxy and Vitest config; strict TypeScript |
| Create `frontend/src/protocol/{snapshot,api}.ts` and `generated/openapi.{json,d.ts}` | The protocol layer |
| Create `frontend/src/room/{view,connection,connectionId}.ts` | The room state layer |
| Create `frontend/src/main.tsx`, `frontend/src/styles.css`, `frontend/src/components/*.tsx` | The view layer |
| Create `frontend/src/**/*.test.ts` | Vitest cases |
| Modify `testkit/app.js`, `test/startup.test.js`, `e2e/fixtures.js`, `e2e/smoke.spec.js`, `playwright.config.js`; create `e2e/lobby.spec.js` | Harness changes |
| Modify `README.md`, `docs/known-issues.md`, `docs/roadmap.md`, the parent design, the frontend spec's status, `docs/superpowers/plans/README.md` | Task 9 |

---

### Task 1: Serve the built page's assets, and answer `503` without a page

The server half of the spec's tooling commit, landed first so its cases are judged alone. `index-path` keeps its old default here, so nothing visible changes yet.

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/PageRoutes.scala`
- Test: `src/test/scala/com/lunatech/pointingpoker/APISpec.scala`

**Interfaces:**
- Consumes: `ApiConfig.indexPath: String`.
- Produces: `GET /assets/<file>` served from `Paths.get(indexPath).resolveSibling("assets")`; `503` on `/` and `/<slug>` while the `index-path` file is missing. Task 2 relies on both.

- [ ] **Step 1: Point `APISpec` at a fixture page, and write the new cases**

In `APISpec.scala`, replace the imports `java.util.{Locale, UUID}` with:

```scala
import java.nio.file.{Files, Path}
import java.util.{Comparator, Locale, UUID}
```

and delete `import scala.io.Source`. Replace the `apiConfig` line with:

```scala
  // A built page stands in for `npm run build`, so the spec does not depend on the frontend.
  val fixtureDir: Path = Files.createTempDirectory("pages")
  val fixtureIndex     = "<!DOCTYPE html><html><body>fixture index</body></html>"
  val fixtureAsset     = "console.log('fixture asset');"
  val fixtureIndexPath = Files.writeString(fixtureDir.resolve("index.html"), fixtureIndex)
  val fixtureAssetPath =
    Files.createDirectories(fixtureDir.resolve("assets")).resolve("app-abc123.js")
  Files.writeString(fixtureAssetPath, fixtureAsset)

  val apiConfig: ApiConfig =
    ApiConfig.load(ConfigFactory.load()).copy(indexPath = fixtureIndexPath.toString)
  val missingConfig: ApiConfig =
    apiConfig.copy(indexPath = fixtureDir.resolve("missing/index.html").toString)
```

After `apiRoute`, add:

```scala
  val missingRoute: Route = handleRejections(RejectionHandler.default) {
    API(roomManager, missingConfig, lifecycleConfig, probeConfig).route
  }
```

At the end of `afterAll`, add:

```scala
    Files.walk(fixtureDir).sorted(Comparator.reverseOrder()).forEach(Files.delete)
```

Replace the cases "return index.html" and "serve the index under a room name" so they compare against `fixtureIndex`, and add the new cases after "return index.html":

```scala
    "return index.html" in
      Get() ~> apiRoute ~> check {
        responseAs[String] mustBe fixtureIndex
      }
    "answer 503 at the index and under a room name when the page is not built" in {
      Get() ~> missingRoute ~> check {
        status mustBe StatusCodes.ServiceUnavailable
        contentType mustBe ContentTypes.`text/plain(UTF-8)`
        responseAs[String] mustBe "The page is not built: run `npm run build`"
      }
      Get(s"/${aSlug().raw}") ~> missingRoute ~> check {
        status mustBe StatusCodes.ServiceUnavailable
        responseAs[String] mustBe "The page is not built: run `npm run build`"
      }
    }
    "warn at construction when the page is not built" in {
      pageLog(PageRoutes(missingConfig)) mustBe
        List(("WARN", "The page is not built: run `npm run build`"))
    }
    "serve an asset from beside the index, cached as immutable" in
      Get("/assets/app-abc123.js") ~> apiRoute ~> check {
        status mustBe StatusCodes.OK
        responseAs[String] mustBe fixtureAsset
        header("Cache-Control").map(_.value) mustBe Some("public, max-age=31536000, immutable")
      }
    "answer 404 for a missing asset, without the immutable header" in
      Get("/assets/app-missing.js") ~> apiRoute ~> check {
        status mustBe StatusCodes.NotFound
        header("Cache-Control") mustBe None
      }
    // %2e%2e is collapsed before routing and reaches the slug matcher; ..%2F reaches the assets route.
    "not serve the index through a traversal out of the assets directory" in {
      Get("/assets/..%2Findex.html") ~> apiRoute ~> check {
        status must not be StatusCodes.OK
      }
      Get("/assets/%2e%2e/index.html") ~> apiRoute ~> check {
        status must not be StatusCodes.OK
      }
    }
```

```scala
    "serve the index under a room name" in
      Get(s"/${aSlug().raw}") ~> apiRoute ~> check {
        status mustBe StatusCodes.OK
        responseAs[String] mustBe fixtureIndex
      }
```

- [ ] **Step 2: Run the spec and watch the new cases fail**

Run: `sbt "testOnly com.lunatech.pointingpoker.APISpec"`
Expected: FAIL. The two `503` cases, the WARN case and the asset case fail, since `PageRoutes` has neither. The fixture-index cases and the two negative cases pass already.

- [ ] **Step 3: Implement the serving changes in `PageRoutes`**

Replace the imports and the body down to `val route` with:

```scala
import java.nio.file.{Files, Path, Paths}
import java.util.Locale

import org.apache.pekko.http.scaladsl.model.{ContentTypes, HttpEntity, HttpResponse, StatusCodes}
import org.apache.pekko.http.scaladsl.model.headers.{CacheDirectives, `Cache-Control`}
import org.apache.pekko.http.scaladsl.model.headers.CacheDirectives.`no-cache`
import org.apache.pekko.http.scaladsl.server.Directives.*
import org.apache.pekko.http.scaladsl.server.Route
import org.apache.pekko.http.scaladsl.server.directives.ContentTypeResolver.Default
import com.lunatech.pointingpoker.config.ApiConfig
import com.lunatech.pointingpoker.slug.{LegacySlug, Slug, Suggestion}
import org.slf4j.{Logger, LoggerFactory}
import org.owasp.encoder.Encode

// The static half stays raw directives: tapir describes what the client calls, not what the
// server hands back off disk.
class PageRoutes(apiConfig: ApiConfig):

  private val log: Logger = LoggerFactory.getLogger(this.getClass)

  // Always revalidate: no-store would re-send the whole page where a 304 costs nothing.
  private def revalidated(route: Route): Route =
    respondWithHeader(`Cache-Control`(`no-cache`))(route)

  private val indexFile: Path = Paths.get(apiConfig.indexPath)
  private val assetsDir: Path = indexFile.resolveSibling("assets")
  private val notBuilt        = "The page is not built: run `npm run build`"

  if !Files.exists(indexFile) then log.warn(notBuilt)

  // Checked per request, so a page built while the server runs is picked up.
  private val index: Route =
    revalidated {
      extract(_ => Files.exists(indexFile)) { built =>
        if built then getFromFile(indexFile.toFile)
        else
          complete(
            HttpResponse(
              StatusCodes.ServiceUnavailable,
              entity = HttpEntity(ContentTypes.`text/plain(UTF-8)`, notBuilt)
            )
          )
      }
    }

  // Asset names carry a content hash, so a cached copy never goes stale.
  private val immutable =
    `Cache-Control`(
      CacheDirectives.public,
      CacheDirectives.`max-age`(31536000),
      CacheDirectives.immutableDirective
    )
```

In `val route`, insert this block between the `path(JavaUUID)` block and the `path(Segment)` block:

```scala
      // A missing asset rejects, so the default handler answers 404 without the immutable header.
      pathPrefix("assets") {
        respondWithHeader(immutable)(getFromDirectory(assetsDir.toString))
      },
```

The rest of the file (`path(Segment)`, `notARoom`, the companion) is unchanged.

- [ ] **Step 4: Run the spec and watch it pass, then prove two cases can fail**

Run: `sbt "testOnly com.lunatech.pointingpoker.APISpec"`
Expected: PASS.

Then, one at a time: replace `index`'s body with `revalidated(getFromFile(indexFile.toFile))` and confirm only the `503` case fails; restore it, replace `respondWithHeader(immutable)(...)` with a bare `getFromDirectory(assetsDir.toString)` and confirm only the immutable-header case fails; restore it. `-Werror` does not flag the then-unused `immutable`, so this check is the only thing that catches a dropped header.

- [ ] **Step 5: Run the whole suite and the style check**

Run: `sbt test` then `sbt scalafmtAll styleCheck`
Expected: all green (211 tests in the spike).

- [ ] **Step 6: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/PageRoutes.scala src/test/scala/com/lunatech/pointingpoker/APISpec.scala
git commit -m "feat(server): serve bundled assets and answer 503 when the page is not built"
```

---

### Task 2: Build today's page with Vite, and serve it from `frontend/dist/`

The rest of the spec's tooling commit. Today's Vue page moves unchanged and Vite builds it, leaving its CDN tags and its template alone, so the unchanged e2e suite judges the new pipeline against the old page.

**Files:**
- Move: `src/main/resources/pages/index.html` to `frontend/index.html`
- Create: `mise.toml`, `clevercloud/build-frontend.sh`, `eslint.config.js`, `frontend/vite.config.ts`, `frontend/tsconfig.json`
- Modify: `package.json`, `package-lock.json`, `.gitignore`, `src/main/resources/application.conf`, `build.sbt`, `testkit/app.js`, `test/startup.test.js`, `.github/workflows/ci.yml`, `.github/dependabot.yml`
- Test: `src/test/scala/com/lunatech/pointingpoker/config/ApiConfigSpec.scala`, `test/startup.test.js`

**Interfaces:**
- Consumes: Task 1's `/assets/` route and `503`.
- Produces: `npm run build` (writes `frontend/dist/`), `npm run dev`, `npm run typecheck`, `npm run lint`, `npm run test:unit`; the `pretest` and `pree2e` hooks building before staging; `INDEX_PATH` in the testkit pointing at `frontend/dist/index.html`.

- [ ] **Step 1: Write the failing startup case for a missing page**

Append to `test/startup.test.js`:

```js
// The launcher check's twin: a missing page is named at once, not after the readiness cap.
test('a missing page fails before the app is spawned', async () => {
  const started = Date.now()
  await assert.rejects(startApp({ env: { INDEX_PATH: '/nonexistent/index.html' } }), error => {
    assert.match(error.message, /\/nonexistent\/index\.html is missing\. Run: npm run build/)
    return true
  })
  assert.ok(Date.now() - started < 1000, 'expected the check to fail before spawning')
})
```

Run: `npm run stage && node --test test/startup.test.js`
Expected: FAIL after the 30 s readiness cap. The app starts, and with Task 1's `503` it never answers `200` for a missing page, so `startApp` rejects with the readiness message rather than the asserted one. `startApp` stops the app on that failure, so no JVM is left behind.

- [ ] **Step 2: Make the testkit check the page and point at `frontend/dist/`**

In `testkit/app.js`, replace the first two comment lines with:

```js
// Starts the staged launcher rather than `sbt run`: it boots in about two seconds, and it is a
// single process so teardown is a clean signal.
```

Replace the `indexPath` constant with:

```js
const indexPath = path.join(repoRoot, 'frontend', 'dist', 'index.html')
```

In `startApp`, after the launcher check, add:

```js
  const page = env.INDEX_PATH ?? indexPath
  if (!fs.existsSync(page)) {
    throw new Error(`${page} is missing. Run: npm run build`)
  }
```

and in the spawned `env`, replace `INDEX_PATH: indexPath,` with `INDEX_PATH: page,`, keeping its comment.

- [ ] **Step 3: Move the page and add the toolchain**

```bash
git mv src/main/resources/pages/index.html frontend/index.html
npm install --save-dev --no-audit --no-fund vite@8.3.1 typescript@~5.9.3 vitest@5.0.2 @vitejs/plugin-react@6.1.1 eslint@10.11.0 typescript-eslint@8.70.1 eslint-plugin-react-hooks@7.1.1 @types/node@24 @types/react@19.3.0 @types/react-dom@19.3.0
npm install --no-audit --no-fund react@19.3.0 react-dom@19.3.0 zod@4.6.5
```

Set `package.json`'s `scripts` to exactly:

```json
  "scripts": {
    "build": "vite build frontend",
    "dev": "vite frontend",
    "typecheck": "tsc -p frontend",
    "lint": "eslint frontend",
    "test:unit": "vitest run --root frontend",
    "stage": "sbt \"; coverageOff; Universal/stage\"",
    "pretest": "npm run build && npm run stage",
    "test": "node --test \"test/**/*.test.js\"",
    "pree2e": "npm run build && npm run stage",
    "e2e": "playwright test"
  },
```

Create `frontend/vite.config.ts`:

```ts
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Nothing may be emitted at the root, where the server's slug route matches every segment.
  publicDir: false,
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  // Page work runs against `sbt run` on 8080; one origin, so the session cookie comes back.
  server: {
    proxy: { '/rooms': 'http://localhost:8080', '/create-room': 'http://localhost:8080' }
  },
  test: { include: ['src/**/*.test.ts'], passWithNoTests: true }
})
```

(`passWithNoTests` holds only until Task 3 adds the first test, and Task 3 removes it.)

Create `frontend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src", "vite.config.ts"]
}
```

Create `eslint.config.js`:

```js
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

// The hooks rules are the point: a hook called conditionally breaks React at runtime, not at build.
export default tseslint.config(
  { ignores: ['frontend/dist/', 'frontend/src/protocol/generated/'] },
  {
    files: ['frontend/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    ...reactHooks.configs.flat.recommended
  }
)
```

Create `mise.toml`:

```toml
[tools]
node = "24.21.0"
```

Create `clevercloud/build-frontend.sh`:

```bash
#!/usr/bin/env bash
# Clever's CC_PRE_BUILD_HOOK and CI both run this before sbt, so the page is built before the server.
set -euo pipefail
# --no-audit drops the registry call that once stalled for npm's full 300s fetch-timeout.
npm ci --include=dev --prefer-offline --no-audit --no-fund --fetch-timeout=60000
npm run build
```

```bash
chmod +x clevercloud/build-frontend.sh
```

Append to `.gitignore`:

```
frontend/dist/
```

- [ ] **Step 4: Move the default page path and drop Docker**

In `application.conf`, set `index-path = "frontend/dist/index.html"` (keep the `${?INDEX_PATH}` line). In `ApiConfigSpec`, change the assertion to:

```scala
      apiConfig.indexPath mustBe "frontend/dist/index.html"
```

In `build.sbt`, delete `.enablePlugins(DockerPlugin)` and the two lines `dockerEnvVars := ...` and `dockerBaseImage := ...`. `JavaAppPackaging`, `UniversalPlugin` and the `Universal / mappings` line for `probe.html` stay.

- [ ] **Step 5: Reorder CI, and ignore TypeScript majors**

In `.github/workflows/ci.yml`'s `test` job, replace everything from `- name: test coverage` through the `install node dependencies` step with:

```yaml
      # Reads mise.toml, the file Clever's build installs Node from too.
      - uses: jdx/mise-action@v4

      # setup-node's npm cache went with setup-node; the lockfile hash retires this one.
      - uses: actions/cache@v6
        with:
          path: ~/.npm
          key: npm-${{ runner.os }}-${{ hashFiles('package-lock.json') }}

      # The deploy's own script, so every push runs it before production first does.
      - name: build the page
        run: ./clevercloud/build-frontend.sh

      - name: typecheck
        run: npm run typecheck

      - name: lint
        run: npm run lint

      - name: test coverage
        run: sbt qa

      - name: Codecov
        uses: codecov/codecov-action@v7

      # After sbt qa, which writes the snapshots the contract test reads.
      - name: frontend unit tests
        run: npm run test:unit
```

Keep the `node tests` step and everything after it unchanged, and update its comment to: `# npm test builds and stages first through its pre-hook, so CI has no stage step of its own.`

In `.github/dependabot.yml`, add to the `npm` entry, after `schedule`:

```yaml
    ignore:
      # openapi-typescript needs TypeScript 5, and typescript-eslint stops before 6.1.
      - dependency-name: "typescript"
        update-types: ["version-update:semver-major"]
```

- [ ] **Step 6: Build, and run every check**

```bash
npm run build && ls frontend/dist
npm run typecheck && npm run lint && npm run test:unit
sbt test
npm test
npm run e2e
```

Expected: `frontend/dist/index.html` exists (Vite minifies the inline `<style>` and leaves every script tag alone; `grep -c https:// frontend/dist/index.html` gives 4). All checks pass, including the new startup case, and the e2e suite passes unchanged.

Then check the dev loop by hand: `SECURE_COOKIES=false sbt run` in one terminal, `npm run dev` in another, open Vite's address, create a room and vote. Stop both.

- [ ] **Step 7: Capture the baseline look**

Save this script outside the repo, as `<scratchpad>/look.mjs`. It is throwaway and never committed.

```js
// Throwaway, never committed: captures the lobby and a room before and after a reveal.
// Copy to the repo root, run after `npm run build && npm run stage`: node look.mjs <out-dir>
import { chromium } from '@playwright/test'
import { startApp } from './testkit/app.js'

const out = process.argv[2]
const app = await startApp()
const browser = await chromium.launch()
try {
  const viewport = { width: 1280, height: 900 }
  const alice = await (await browser.newContext({ baseURL: app.baseUrl, viewport })).newPage()
  const bob = await (await browser.newContext({ baseURL: app.baseUrl, viewport })).newPage()
  const name = page =>
    page.locator('.form-group.row').filter({ hasText: 'User name' }).locator('input')
  await alice.goto('/')
  await name(alice).waitFor()
  await alice.screenshot({ path: `${out}/1-lobby.png`, fullPage: true })
  await name(alice).fill('Alice')
  await alice.getByRole('button', { name: 'Create' }).click()
  await alice.getByRole('button', { name: 'Show votes' }).waitFor()
  const room = (await alice.locator('.card-title').innerText()).trim()
  await bob.goto(`/${room}`)
  await name(bob).fill('Bob')
  await bob.getByRole('button', { name: 'Join' }).click()
  await bob.getByRole('button', { name: 'Show votes' }).waitFor()
  await alice.getByRole('button', { name: '5', exact: true }).click()
  await bob.getByRole('button', { name: '8', exact: true }).click()
  await alice.locator('tbody tr').nth(1).waitFor()
  await alice.waitForTimeout(500)
  await alice.screenshot({ path: `${out}/2-room-before-reveal.png`, fullPage: true })
  await alice.getByRole('button', { name: 'Show votes' }).click()
  await alice.getByText('Most voted estimation').waitFor()
  await alice.waitForTimeout(500)
  await alice.screenshot({ path: `${out}/3-room-after-reveal.png`, fullPage: true })
} finally {
  await browser.close()
  await app.stop()
}
```

```bash
mkdir -p <scratchpad>/look-before && cp <scratchpad>/look.mjs . && node look.mjs <scratchpad>/look-before; rm look.mjs
```

Expected: three PNGs of today's page. Keep them for Task 8.

- [ ] **Step 8: Commit**

```bash
git add -A frontend mise.toml clevercloud eslint.config.js package.json package-lock.json .gitignore src/main/resources/application.conf build.sbt testkit/app.js test/startup.test.js .github src/test/scala/com/lunatech/pointingpoker/config/ApiConfigSpec.scala
git status --short   # expect the rename of index.html, and no frontend/dist
git commit -m "build(frontend): build the page with Vite and serve it from frontend/dist"
```

---

### Task 3: Port the room state to TypeScript

`applySnapshot`, the stream handling and the connection id move into plain TypeScript with unit tests, unused by the page until Task 4. Behaviour is today's, including what step 8a later changes.

**Files:**
- Create: `frontend/src/protocol/snapshot.ts`, `frontend/src/protocol/api.ts`, `frontend/src/room/view.ts`, `frontend/src/room/connection.ts`, `frontend/src/room/connectionId.ts`
- Test: `frontend/src/protocol/snapshot.test.ts`, `frontend/src/room/view.test.ts`, `frontend/src/room/connection.test.ts`, `frontend/src/room/connectionId.test.ts`
- Modify: `frontend/vite.config.ts` (drop `passWithNoTests`), `package.json` (axios)

**Interfaces:**
- Produces, for Task 4:
  - `snapshot.ts`: `snapshotSchema`, `strictSnapshotSchema`, `type RoomSnapshot`, `type Participant`.
  - `view.ts`: `type ParticipantRow`, `type View = { users: ParticipantRow[]; votesRevealed: boolean; currentIssue: string; userEstimation: string; ownVoteConfirmed: boolean; votesSummary: [string, number][] }`, `type Previous = { issueFocused: boolean; currentIssue: string }`, `applySnapshot(prev: Previous, s: RoomSnapshot): View`.
  - `connection.ts`: `type RoomStore = { lost: boolean; fatal: boolean; snapshot: RoomSnapshot | null }`, `type Stream`, `type ConnectionDeps = { connectionId: string; openStream: (url: string) => Stream; sendBeacon: (url: string) => void }`, `type Connection = { subscribe(listener): () => void; getSnapshot(): RoomStore; open(roomId: string): void; leave(): void; pageHide(persisted: boolean): void }`, `createConnection(deps: ConnectionDeps): Connection`.
  - `connectionId.ts`: `mintConnectionId(): string`.
  - `api.ts`: `type JoinOutcome = 'joined' | 'not-a-room'`, `createRoom(): Promise<string>`, `join(roomId, name): Promise<JoinOutcome>`, `type Command = 'show' | 'clear' | 'revote'`, `command(roomId, name: Command): Promise<void>`, `vote(roomId, estimation): Promise<void>`, `editIssue(roomId, issue): Promise<void>`. Task 5 keeps these signatures.

- [ ] **Step 1: Write the failing tests**

Delete `passWithNoTests: true` from `frontend/vite.config.ts`, leaving `test: { include: ['src/**/*.test.ts'] }`.

`frontend/src/protocol/snapshot.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { snapshotSchema, strictSnapshotSchema } from './snapshot'

const base = {
  you: 'a',
  currentIssue: '',
  votesRevealed: false,
  users: [{ id: 'a', name: 'A', voted: false, hasEstimation: false, estimation: '' }]
}

describe('the snapshot schemas', () => {
  it('drop an unknown key when lenient and refuse it at any depth when strict', () => {
    const top = { ...base, extra: 1 }
    const nested = { ...base, users: [{ ...base.users[0], extra: 1 }] }
    expect(snapshotSchema.parse(top)).toEqual(base)
    expect(snapshotSchema.parse(nested)).toEqual(base)
    expect(strictSnapshotSchema.safeParse(top).success).toBe(false)
    expect(strictSnapshotSchema.safeParse(nested).success).toBe(false)
    expect(strictSnapshotSchema.safeParse(base).success).toBe(true)
  })
})
```

`frontend/src/room/view.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Participant, RoomSnapshot } from '../protocol/snapshot'
import { applySnapshot } from './view'

const row = (id: string, voted: boolean, estimation: string): Participant => ({
  id,
  name: id.toUpperCase(),
  voted,
  hasEstimation: estimation !== '' || voted,
  estimation
})
const snap = (users: Participant[], extra: Partial<RoomSnapshot> = {}): RoomSnapshot => ({
  you: 'a',
  currentIssue: 'PP-1',
  votesRevealed: false,
  users,
  ...extra
})
const idle = { issueFocused: false, currentIssue: '' }

describe('applySnapshot', () => {
  it('tallies every participant with an estimation, confirmed or not, most votes first', () => {
    const s = snap(
      [row('a', true, '5'), row('b', false, '8'), row('c', true, '8'), row('d', false, '')],
      { votesRevealed: true }
    )
    expect(applySnapshot(idle, s).votesSummary).toEqual([
      ['8', 2],
      ['5', 1]
    ])
  })

  it("keeps the typed issue while the input is focused, and takes the room's otherwise", () => {
    const s = snap([row('a', false, '')])
    expect(applySnapshot({ issueFocused: true, currentIssue: 'draft' }, s).currentIssue).toBe('draft')
    expect(applySnapshot({ issueFocused: false, currentIssue: 'draft' }, s).currentIssue).toBe('PP-1')
  })

  it("reads the reader's own estimation and whether it is confirmed", () => {
    const own = (voted: boolean, estimation: string) =>
      applySnapshot(idle, snap([row('a', voted, estimation)]))
    expect(own(true, '5')).toMatchObject({ userEstimation: '5', ownVoteConfirmed: true })
    expect(own(false, '5')).toMatchObject({ userEstimation: '5', ownVoteConfirmed: false })
    expect(own(false, '')).toMatchObject({ userEstimation: '', ownVoteConfirmed: true })
    const absent = applySnapshot(idle, snap([row('b', true, '5')]))
    expect(absent).toMatchObject({ userEstimation: '', ownVoteConfirmed: true })
  })
})
```

`frontend/src/room/connection.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createConnection, type Stream } from './connection'

class FakeStream implements Stream {
  readyState = 0
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  closed = false
  constructor(readonly url: string) {}
  close() {
    this.closed = true
    this.readyState = 2
  }
  open = () => this.onopen!(new Event('open'))
  error = () => this.onerror!(new Event('error'))
  message = (data: string) => this.onmessage!(new MessageEvent('message', { data }))
}

const frame = JSON.stringify({
  you: 'a',
  currentIssue: 'PP-1',
  votesRevealed: false,
  users: [{ id: 'a', name: 'Alice', voted: false, hasEstimation: false, estimation: '' }]
})

describe('createConnection', () => {
  let streams: FakeStream[]
  let beacons: string[]
  const connect = () =>
    createConnection({
      connectionId: 'c-1',
      openStream: url => {
        const s = new FakeStream(url)
        streams.push(s)
        return s
      },
      sendBeacon: url => void beacons.push(url)
    })

  beforeEach(() => {
    streams = []
    beacons = []
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('opens the room stream under the page connection id', () => {
    connect().open('brave-golden-otter')
    expect(streams.map(s => s.url)).toEqual(['/rooms/brave-golden-otter/events?connectionId=c-1'])
  })

  it('stores a parsed snapshot, and ignores a heartbeat and an invalid frame', () => {
    const c = connect()
    c.open('r')
    streams[0].message(frame)
    const stored = c.getSnapshot()
    expect(stored.snapshot?.currentIssue).toBe('PP-1')
    streams[0].message('')
    streams[0].message('{"you":1}')
    expect(c.getSnapshot()).toBe(stored)
  })

  // Client and server ship together, so this is a development safety net, not a protocol rule.
  it('keeps a snapshot carrying a field it does not know, without the field', () => {
    const c = connect()
    c.open('r')
    streams[0].message(JSON.stringify({ ...JSON.parse(frame), history: [] }))
    expect(c.getSnapshot().snapshot).toEqual(JSON.parse(frame))
  })

  it('returns the same store object until something changes', () => {
    const c = connect()
    expect(c.getSnapshot()).toBe(c.getSnapshot())
  })

  it('marks a retrying stream lost and a closed one fatal, and clears both on open', () => {
    const c = connect()
    c.open('r')
    streams[0].error()
    expect(c.getSnapshot()).toMatchObject({ lost: true, fatal: false })
    streams[0].open()
    expect(c.getSnapshot()).toMatchObject({ lost: false, fatal: false })
    streams[0].readyState = 2
    streams[0].error()
    expect(c.getSnapshot()).toMatchObject({ lost: false, fatal: true })
  })

  it('closes the stream, then sends the leave beacon and forgets the room, on leave', () => {
    const c = connect()
    c.open('r')
    streams[0].message(frame)
    c.leave()
    expect(streams[0].closed).toBe(true)
    expect(beacons).toEqual(['/rooms/r/leave?connectionId=c-1'])
    expect(c.getSnapshot()).toEqual({ lost: false, fatal: false, snapshot: null })
  })

  it('sends the beacon on pagehide only for a discarded page that reached the room', () => {
    const c = connect()
    c.open('r')
    c.pageHide(false)
    expect(beacons).toEqual([])
    streams[0].message(frame)
    c.pageHide(true)
    expect(beacons).toEqual([])
    c.pageHide(false)
    expect(beacons).toEqual(['/rooms/r/leave?connectionId=c-1'])
  })

  it('notifies subscribers on a change and stops after unsubscribing', () => {
    const c = connect()
    const listener = vi.fn()
    const unsubscribe = c.subscribe(listener)
    c.open('r')
    streams[0].message(frame)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    streams[0].error()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
```

`frontend/src/room/connectionId.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mintConnectionId } from './connectionId'

const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('mintConnectionId', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('mints a version 4 UUID', () => {
    expect(mintConnectionId()).toMatch(v4)
  })

  // A page over plain HTTP is not a secure context, so randomUUID is missing there.
  it('mints a version 4 UUID without crypto.randomUUID', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => real.getRandomValues(a) })
    const ids = Array.from({ length: 50 }, mintConnectionId)
    ids.forEach(id => expect(id).toMatch(v4))
    expect(new Set(ids).size).toBe(50)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npm run test:unit`
Expected: FAIL, every file failing to import its module.

- [ ] **Step 3: Write the modules**

```bash
npm install --no-audit --no-fund axios@1.20.0
```

`frontend/src/protocol/snapshot.ts`:

```ts
import { z } from 'zod'

type ObjectOf = typeof z.object

// One definition for both strictness rules: zod's is per object, so two copies could drift.
function build(object: ObjectOf) {
  const participant = object({
    id: z.string(),
    name: z.string(),
    voted: z.boolean(),
    hasEstimation: z.boolean(),
    estimation: z.string()
  })
  return object({
    you: z.string(),
    currentIssue: z.string(),
    votesRevealed: z.boolean(),
    users: z.array(participant)
  })
}

// Lenient for the page: an unknown field is dropped, since refusing it could only break the room.
export const snapshotSchema = build(z.object)
// Typed as z.object: only the unknown-key rule differs, and nothing infers from this one.
export const strictSnapshotSchema = build(z.strictObject as ObjectOf)

export type RoomSnapshot = z.infer<typeof snapshotSchema>
export type Participant = RoomSnapshot['users'][number]
```

(The cast is required: `tsc` rejects `z.strictObject` as `typeof z.object`, since their optional-parameter signatures differ.)

`frontend/src/room/view.ts`:

```ts
import type { Participant, RoomSnapshot } from '../protocol/snapshot'

export type ParticipantRow = Participant

export type View = {
  users: ParticipantRow[]
  votesRevealed: boolean
  currentIssue: string
  userEstimation: string
  ownVoteConfirmed: boolean
  votesSummary: [string, number][]
}

// prev carries only what the next view depends on; step 8b removes issueFocused.
export type Previous = { issueFocused: boolean; currentIssue: string }

export function applySnapshot(prev: Previous, s: RoomSnapshot): View {
  const me = s.users.find(u => u.id === s.you)
  const tally: Record<string, number> = {}
  // Whoever has an estimation, which is what the table renders. Not u.voted: that drops a
  // re-vote in progress, where the value stands and the confirmation does not.
  s.users.forEach(u => {
    if (u.hasEstimation) tally[u.estimation] = (tally[u.estimation] || 0) + 1
  })
  return {
    users: s.users,
    votesRevealed: s.votesRevealed,
    // Do not clobber the issue input while the user is typing in it.
    currentIssue: prev.issueFocused ? prev.currentIssue : s.currentIssue,
    userEstimation: me ? me.estimation : '',
    ownVoteConfirmed: !me || me.voted || !me.estimation,
    votesSummary: Object.entries(tally).sort((a, b) => b[1] - a[1])
  }
}
```

`frontend/src/room/connectionId.ts`:

```ts
// randomUUID exists only in a secure context; getRandomValues also works over plain HTTP.
export function mintConnectionId(): string {
  if (crypto.randomUUID) return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC 4122 variant
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return hex.replace(/^(.{8})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4-')
}
```

`frontend/src/room/connection.ts`:

```ts
import { snapshotSchema, type RoomSnapshot } from '../protocol/snapshot'

export type RoomStore = { lost: boolean; fatal: boolean; snapshot: RoomSnapshot | null }

// The slice of EventSource this module uses, so a test can hand it a fake.
export type Stream = {
  readonly readyState: number
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent<string>) => void) | null
  onerror: ((event: Event) => void) | null
  close(): void
}

export type ConnectionDeps = {
  connectionId: string
  openStream: (url: string) => Stream
  sendBeacon: (url: string) => void
}

export type Connection = {
  subscribe(listener: () => void): () => void
  getSnapshot(): RoomStore
  open(roomId: string): void
  leave(): void
  pageHide(persisted: boolean): void
}

const CLOSED = 2
const initial: RoomStore = { lost: false, fatal: false, snapshot: null }

export function createConnection(deps: ConnectionDeps): Connection {
  let store = initial
  let roomId: string | null = null
  let stream: Stream | null = null
  const listeners = new Set<() => void>()

  // A new object only on a change, since useSyncExternalStore re-renders on every new one.
  const update = (next: Partial<RoomStore>) => {
    store = { ...store, ...next }
    listeners.forEach(listener => listener())
  }

  // sendBeacon rather than a POST: an unload-adjacent fetch is not reliably delivered.
  const postLeave = (id: string) =>
    deps.sendBeacon(`/rooms/${id}/leave?connectionId=${deps.connectionId}`)

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => store,

    // Step 8a closes the previous stream first; today's page does not.
    open(id) {
      roomId = id
      const opened = deps.openStream(`/rooms/${id}/events?connectionId=${deps.connectionId}`)
      stream = opened
      // A successful (re)connection means any earlier banner from onerror is stale.
      opened.onopen = () => update({ lost: false, fatal: false })
      opened.onmessage = event => {
        // Keep-alive heartbeats arrive as an event with an empty data payload.
        if (!event.data) return
        const parsed = snapshotSchema.safeParse(JSON.parse(event.data))
        if (!parsed.success) {
          console.error('Dropped an invalid snapshot:', parsed.error)
          return
        }
        update({ snapshot: parsed.data })
      }
      // CLOSED means a non-2xx answer the browser will not retry; anything else it is retrying.
      opened.onerror = event => {
        if (opened.readyState === CLOSED) update({ lost: false, fatal: true })
        else update({ lost: true, fatal: false })
        console.error('EventSource error observed:', event)
      }
    },

    // Closed before the beacon: the server ends a departed stream, and an open one reconnects.
    leave() {
      stream?.close()
      stream = null
      if (roomId !== null) postLeave(roomId)
      roomId = null
      update(initial)
    },

    // Only a page being discarded: a cached page can be restored with no load.
    pageHide(persisted) {
      if (persisted || store.snapshot === null || roomId === null) return
      postLeave(roomId)
    }
  }
}
```

`frontend/src/protocol/api.ts`:

```ts
import axios from 'axios'

// Every call rejects on a failure, so a component's catch is the one place a failure lands.
export type JoinOutcome = 'joined' | 'not-a-room'

export async function createRoom(): Promise<string> {
  const response = await axios.post<string>('/create-room', {})
  return response.data
}

export async function join(roomId: string, name: string): Promise<JoinOutcome> {
  try {
    await axios.post(`/rooms/${roomId}/join`, { name })
    return 'joined'
  } catch (error) {
    // Only a typed or remembered name reaches /join unchecked; the page route answers it.
    if (axios.isAxiosError(error) && error.response?.status === 404) return 'not-a-room'
    throw error
  }
}

export type Command = 'show' | 'clear' | 'revote'

export async function command(roomId: string, name: Command): Promise<void> {
  await axios.post(`/rooms/${roomId}/${name}`, {})
}

export async function vote(roomId: string, estimation: string): Promise<void> {
  await axios.post(`/rooms/${roomId}/vote`, { estimation })
}

export async function editIssue(roomId: string, issue: string): Promise<void> {
  await axios.post(`/rooms/${roomId}/edit-issue`, { issue })
}
```

- [ ] **Step 4: Run the tests, then prove the fallback test can fail**

Run: `npm run test:unit && npm run typecheck && npm run lint`
Expected: PASS, 13 tests.

Then add `throw new Error('fallback')` as the first line after the `randomUUID` check in `mintConnectionId`, run `npm run test:unit`, confirm only "mints a version 4 UUID without crypto.randomUUID" fails, and remove the line.

- [ ] **Step 5: Commit**

```bash
git add frontend package.json package-lock.json
git commit -m "feat(frontend): port the room state to TypeScript"
```

---

### Task 4: Replace the Vue page with React components

The page switches to the React mount. The Playwright suite, unchanged but for the harness, is the judge, and the off-origin guard makes "no CDN request" a property every case checks.

**Files:**
- Replace: `frontend/index.html`
- Create: `frontend/src/main.tsx`, `frontend/src/styles.css`, `frontend/src/components/{App,Alerts,Lobby,Room,RoomHeader,IssueEditor,Deck,Controls,Results,Participants}.tsx`, `frontend/src/components/useRoom.ts`, `frontend/src/components/useFlash.ts`, `e2e/lobby.spec.js`
- Modify: `e2e/fixtures.js`, `e2e/smoke.spec.js`, `playwright.config.js`, `.github/dependabot.yml`, `package.json` (Bootstrap, Lucide)

**Interfaces:**
- Consumes: everything Task 3 produces.
- Produces: `useRoom(connection: Connection): RoomStore`. The DOM keeps today's markup and class names, which every e2e selector relies on.

- [ ] **Step 1: Write the lobby cases and the off-origin guard, and run them against today's page**

Create `e2e/lobby.spec.js`:

```js
import { test, expect, nameInput } from './fixtures.js'

// The join fixture clicks the buttons, so these are the keyboard and paste paths nothing else takes.
test('Enter in the name field creates a room', async ({ page, origin }) => {
  await page.goto(`${origin}/`)
  await nameInput(page).fill('Alice')
  await nameInput(page).press('Enter')
  await expect(page.getByRole('button', { name: 'Show votes' })).toBeVisible()
})

test('a room name pasted with spaces into the Join form still joins', async ({
  page,
  origin,
  room
}) => {
  await page.goto(`${origin}/`)
  await page.getByRole('link', { name: 'Join' }).click()
  await page.locator('#join-roomId').fill(`  ${room} `)
  await nameInput(page).fill('Alice')
  await nameInput(page).press('Enter')
  await expect(page.getByRole('button', { name: 'Show votes' })).toBeVisible()
  await expect(page.getByRole('heading', { name: room, exact: true })).toBeVisible()
})
```

In `e2e/fixtures.js`, replace the `CDN` and `DROPPED` constants and their comments with:

```js
// The page is bundled and served by the app, so any other host is a regression. A predicate
// rather than a glob, so same-origin traffic (the stub, the app, the streams) never reaches it.
const isOffOrigin = url => url.hostname !== '127.0.0.1'
const guard = async (context, blocked) => {
  await context.route(isOffOrigin, route => {
    blocked.push(route.request().url())
    return route.abort()
  })
}
```

Delete the whole `assets` fixture. Replace the `context` fixture with:

```js
  // Every context the suite opens goes through guard, here and in join, or a page could pass.
  offOrigin: async ({}, use) => {
    const blocked = []
    await use(blocked)
    expect(blocked, 'requests to a host other than 127.0.0.1').toEqual([])
  },

  context: async ({ context, offOrigin }, use) => {
    await guard(context, offOrigin)
    await use(context)
  },
```

In `join`, change the fixture's parameters from `{ browser, origin, room, stub, assets }` to `{ browser, origin, room, stub, offOrigin }`, and replace `await context.route(CDN, assets)` with `await guard(context, offOrigin)`. Then update three comments in `join`:

- `// one participant. localStorage already holds the name and room, so created() rejoins.` becomes `// one participant. localStorage holds the name and room, so the React mount rejoins.`
- `// The input renders under v-if, so this is the mount; navigationTimeout owns the transport.` becomes `// The lobby renders only once React mounts, so this is the mount.`
- `// inRoom flips on the first SSE message, so the room view proves the stream arrived.` becomes `// The room renders on the first SSE message, so the room view proves the stream arrived.`

In `e2e/smoke.spec.js`, change `inRoom flips on the first SSE message` to `The room renders on the first SSE message`, keeping the rest of that comment.

In `playwright.config.js`, replace the `retries` comment with `// Nothing off-origin is loaded, so a retry has no flaky network to paper over.` and the two-line `use` comment with `// Bounds a navigation that hangs, which waitUntil cannot and the mount assertion never reaches.`

Run: `npm run e2e`
Expected: FAIL across the suite. Every case's page requests the three CDNs, which the guard aborts and records, so Vue never mounts and the cases fail on their first assertion or on the guard itself. That is the guard's failure against today's page. Then run `npx playwright test e2e/lobby.spec.js` with the guard's `route.abort()` temporarily replaced by `route.continue()` and the `expect` in `offOrigin` commented out: both lobby cases pass on today's page, which makes them characterization cases. Restore both lines.

- [ ] **Step 2: Add Bootstrap and Lucide, and ignore Bootstrap majors**

```bash
npm install --no-audit --no-fund bootstrap@4.6.2 lucide-react@1.48.0
```

In `.github/dependabot.yml`'s `ignore` list, add:

```yaml
      # Bootstrap 5 would break the frozen look; step 8c decides the library.
      - dependency-name: "bootstrap"
        update-types: ["version-update:semver-major"]
```

- [ ] **Step 3: Replace the page with the React mount**

`frontend/index.html`, whole file:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Pointing Poker</title>
  </head>
  <body>
    <div id="app" class="container"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`frontend/src/styles.css` is the old page's `<style>` block moved verbatim, less the `.feather` rule (Lucide takes `size={20}`), with the `:disabled` comment reworded. Take it from the previous commit:

```bash
git show HEAD:frontend/index.html | sed -n '7,83p' | sed 's/^      //' > frontend/src/styles.css
```

Check it starts with `:root {` and ends with the `.estimation-button-uncomfirmed` rule, then replace its comment

```css
/* Bootstrap fades a disabled .btn to .65 already; restated so a frozen deck does not
   depend on the CDN stylesheet, and the cursor is ours either way. */
```

with

```css
/* Bootstrap fades a disabled .btn to .65 already; restated so a frozen deck does not
   depend on Bootstrap's rule, and the cursor is ours either way. */
```

`frontend/src/main.tsx`:

```tsx
import 'bootstrap/dist/css/bootstrap.min.css'
import './styles.css'
import { createRoot } from 'react-dom/client'
import { App } from './components/App'
import { createConnection } from './room/connection'
import { mintConnectionId } from './room/connectionId'

// One per page instance, never persisted: a reload must mint a new one, or its own late
// beacon would name the id the replacement page is now using.
const connection = createConnection({
  connectionId: mintConnectionId(),
  openStream: url => new EventSource(url),
  sendBeacon: url => void navigator.sendBeacon(url)
})
window.addEventListener('pagehide', event => connection.pageHide(event.persisted))

// No StrictMode: its double effect would join twice, and 8a's close-before-open is not here yet.
createRoot(document.getElementById('app')!).render(<App connection={connection} />)
```

`frontend/src/components/useRoom.ts`:

```ts
import { useSyncExternalStore } from 'react'
import type { Connection, RoomStore } from '../room/connection'

// The one way components read room state.
export function useRoom(connection: Connection): RoomStore {
  return useSyncExternalStore(connection.subscribe, connection.getSnapshot)
}
```

`frontend/src/components/useFlash.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'

// A flag that turns itself off after ms; flashing again restarts the wait.
export function useFlash(ms: number): [boolean, () => void] {
  const [on, setOn] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const flash = useCallback(() => {
    setOn(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOn(false), ms)
  }, [ms])
  return [on, flash]
}
```

`frontend/src/components/App.tsx`:

```tsx
import { useEffect, useState } from 'react'
import * as api from '../protocol/api'
import type { Connection } from '../room/connection'
import { Alerts } from './Alerts'
import { Lobby, type LobbyTab } from './Lobby'
import { Room } from './Room'
import { useFlash } from './useFlash'
import { useRoom } from './useRoom'

// Read once at startup: the path wins over the remembered room, and the name persists.
const pathRoom = window.location.pathname.split('/')[1] ?? ''
// Set by the legacy-link redirect; cleared from the address so a copied link is clean.
const movedOnLoad = new URLSearchParams(window.location.search).get('moved') === '1'
if (movedOnLoad) history.replaceState(null, '', window.location.pathname)

export function App({ connection }: { connection: Connection }) {
  const room = useRoom(connection)
  const [roomId, setRoomId] = useState(pathRoom || localStorage.getItem('roomId') || '')
  const [name, setName] = useState(localStorage.getItem('name') ?? '')
  const [tab, setTab] = useState<LobbyTab>(pathRoom ? 'join' : 'create')
  const [error, setError] = useState('')
  const [moved, setMoved] = useState(movedOnLoad)
  const [copied, flashCopied] = useFlash(2000)

  const doJoin = (id: string) => {
    localStorage.setItem('roomId', id)
    localStorage.setItem('name', name)
    api
      .join(id, name)
      .then(outcome => {
        if (outcome === 'not-a-room') {
          localStorage.removeItem('roomId')
          window.location.assign('/' + encodeURIComponent(id))
          return
        }
        setError('')
        connection.open(id)
      })
      .catch(reason => {
        setError('Could not join the room. Please try again.')
        console.error('Failed to join room:', reason)
      })
  }

  const doCreate = () => {
    api
      .createRoom()
      .then(created => {
        setRoomId(created)
        doJoin(created)
      })
      .catch(reason => {
        console.log(reason)
        setError('Could not create a room. Please try again.')
      })
  }

  const doLeave = () => {
    connection.leave()
    localStorage.clear()
  }

  // Today's startup rejoin: a room and a name, from the path or from before, join at once.
  useEffect(() => {
    if (roomId && name) doJoin(roomId)
    // Once, on mount, as the Vue page's created() ran once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const connectionMessage = room.fatal
    ? 'Your session has ended. Please reload the page to rejoin.'
    : room.lost
      ? 'Connection to the room was lost'
      : ''

  return (
    <>
      <Alerts
        error={connectionMessage || error}
        copied={copied}
        moved={moved}
        onDismissMoved={() => setMoved(false)}
      />
      {room.snapshot === null ? (
        <Lobby
          tab={tab}
          onTab={setTab}
          roomId={roomId}
          onRoomId={setRoomId}
          name={name}
          onName={setName}
          onCreate={doCreate}
          onJoin={() => {
            // v-model.trim's job: a pasted name with a trailing space is not refused.
            const id = roomId.trim()
            setRoomId(id)
            doJoin(id)
          }}
        />
      ) : (
        <Room roomId={roomId} snapshot={room.snapshot} onCopied={flashCopied} onLeave={doLeave} />
      )}
    </>
  )
}
```

`frontend/src/components/Alerts.tsx`:

```tsx
type Props = { error: string; copied: boolean; moved: boolean; onDismissMoved: () => void }

export function Alerts({ error, copied, moved, onDismissMoved }: Props) {
  return (
    <div className="row">
      <div className="col-md-8 offset-md-2">
        {error && (
          <div className="alert alert-danger m-1" role="alert">
            {error}
          </div>
        )}
        {copied && (
          <div className="alert alert-info m-1" role="alert">
            Link copied to clipboard
          </div>
        )}
        {moved && (
          <div className="alert alert-warning m-1" role="status">
            The old link you followed now opens this address. Please update your invitation or
            bookmark to use it.
            <button type="button" className="close" aria-label="Dismiss" onClick={onDismissMoved}>
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

`frontend/src/components/Lobby.tsx`:

```tsx
import type { KeyboardEvent, MouseEvent } from 'react'

export type LobbyTab = 'create' | 'join'

type Props = {
  tab: LobbyTab
  onTab: (tab: LobbyTab) => void
  roomId: string
  onRoomId: (roomId: string) => void
  name: string
  onName: (name: string) => void
  onCreate: () => void
  onJoin: () => void
}

const onEnter = (action: () => void) => (event: KeyboardEvent) => {
  if (event.key === 'Enter') action()
}

export function Lobby(props: Props) {
  const { tab, onTab, roomId, onRoomId, name, onName, onCreate, onJoin } = props
  const select = (next: LobbyTab) => (event: MouseEvent) => {
    event.preventDefault()
    onTab(next)
  }
  const tabClass = (which: LobbyTab) => (tab === which ? 'nav-link active' : 'nav-link')
  const nameRow = (action: () => void) => (
    <div className="form-group row">
      <label className="col-sm-3 col-form-label">User name</label>
      <div className="col-sm-9">
        <input
          type="text"
          className="form-control"
          value={name}
          onChange={e => onName(e.target.value)}
          onKeyUp={onEnter(action)}
        />
      </div>
    </div>
  )
  return (
    <div className="row">
      <div className="col-md-8 offset-md-2">
        <div className="card text-center shadow-sm m-1">
          <div className="card-header">
            Pointing Poker
            <ul className="nav nav-tabs card-header-tabs">
              <li className="nav-item">
                <a className={tabClass('create')} href="#" onClick={select('create')}>
                  Create
                </a>
              </li>
              <li className="nav-item">
                <a className={tabClass('join')} href="#" onClick={select('join')}>
                  Join
                </a>
              </li>
            </ul>
          </div>
          {tab === 'create' && (
            <div className="card-body">
              <h5 className="card-title">Create Room</h5>
              {nameRow(onCreate)}
              <div className="row">
                <div className="col-sm-3 offset-sm-9">
                  <button type="button" className="btn btn-primary" onClick={onCreate}>
                    Create
                  </button>
                </div>
              </div>
            </div>
          )}
          {tab === 'join' && (
            <div className="card-body">
              <h5 className="card-title">Join Room</h5>
              <div className="form-group row">
                <label htmlFor="join-roomId" className="col-sm-3 col-form-label">
                  Room id
                </label>
                <div className="col-sm-9">
                  <input
                    type="text"
                    className="form-control"
                    id="join-roomId"
                    value={roomId}
                    onChange={e => onRoomId(e.target.value)}
                  />
                </div>
              </div>
              {nameRow(onJoin)}
              <div className="row">
                <div className="col-sm-3 offset-sm-9">
                  <button type="button" className="btn btn-primary" onClick={onJoin}>
                    Join
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

`frontend/src/components/Room.tsx`:

```tsx
import { useState } from 'react'
import * as api from '../protocol/api'
import type { RoomSnapshot } from '../protocol/snapshot'
import { applySnapshot, type View } from '../room/view'
import { Controls } from './Controls'
import { Deck } from './Deck'
import { IssueEditor } from './IssueEditor'
import { Participants } from './Participants'
import { Results } from './Results'
import { RoomHeader } from './RoomHeader'

type Props = { roomId: string; snapshot: RoomSnapshot; onCopied: () => void; onLeave: () => void }

const log = (reason: unknown) => console.log(reason)

export function Room({ roomId, snapshot, onCopied, onLeave }: Props) {
  const [issueFocused, setIssueFocused] = useState(false)
  const [seen, setSeen] = useState(snapshot)
  const [view, setView] = useState<View>(() =>
    applySnapshot({ issueFocused: false, currentIssue: '' }, snapshot)
  )
  // A new snapshot folds into the view during render, so no frame renders a stale view.
  if (snapshot !== seen) {
    setSeen(snapshot)
    setView(applySnapshot({ issueFocused, currentIssue: view.currentIssue }, snapshot))
  }

  const vote = (estimation: string) => {
    // The server refuses it anyway; this only spares the doomed POST.
    if (view.votesRevealed) return
    api.vote(roomId, estimation).catch(log)
  }

  return (
    <div className="row">
      <div className="col-md-8 offset-md-2">
        <div className="card text-center shadow-sm m-1">
          <RoomHeader roomId={roomId} onCopied={onCopied} onLeave={onLeave} />
          <div className="card-body">
            <IssueEditor
              issue={view.currentIssue}
              onIssue={currentIssue => setView(v => ({ ...v, currentIssue }))}
              onFocusChange={setIssueFocused}
              onCommit={() => api.editIssue(roomId, view.currentIssue).catch(log)}
            />
            <Deck view={view} onVote={vote} />
            <Controls
              revealed={view.votesRevealed}
              onShow={() => api.command(roomId, 'show').catch(log)}
              onRevote={() => api.command(roomId, 'revote').catch(log)}
              onClear={() => api.command(roomId, 'clear').catch(log)}
            />
            <Results view={view} />
            <Participants view={view} />
          </div>
        </div>
      </div>
    </div>
  )
}
```

`frontend/src/components/RoomHeader.tsx`:

```tsx
import type { MouseEvent } from 'react'

type Props = { roomId: string; onCopied: () => void; onLeave: () => void }

export function RoomHeader({ roomId, onCopied, onLeave }: Props) {
  const copy = (event: MouseEvent) => {
    event.preventDefault()
    const el = document.createElement('textarea')
    el.value = window.location.origin + '/' + roomId
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
    onCopied()
  }
  const leave = (event: MouseEvent) => {
    event.preventDefault()
    onLeave()
  }
  return (
    <div className="card-header">
      <div className="row align-items-center">
        <div className="col">
          <h2>Pointing Poker</h2>
        </div>
        <div className="col">
          <div className="row">
            <div className="col">
              <h5 className="card-title">{roomId}</h5>
            </div>
          </div>
          <div className="row">
            <div className="col">
              <a className="nav-link" href="#" onClick={copy}>
                Copy link
              </a>
            </div>
            <div className="col">
              <a className="nav-link" href="#" onClick={leave}>
                Leave
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

`frontend/src/components/IssueEditor.tsx`:

```tsx
import { useState } from 'react'
import { Check, Pencil } from 'lucide-react'

type Props = {
  issue: string
  onIssue: (issue: string) => void
  onFocusChange: (focused: boolean) => void
  onCommit: () => void
}

export function IssueEditor({ issue, onIssue, onFocusChange, onCommit }: Props) {
  const [editing, setEditing] = useState(false)
  const commit = () => {
    setEditing(false)
    // Removing the focused input fires no blur, so release the guard here or it sticks.
    onFocusChange(false)
    onCommit()
  }
  return (
    <div className="form-group row">
      <div className="col">
        {editing ? (
          <div className="input-group">
            <input
              type="text"
              placeholder="Current issue"
              className="form-control"
              value={issue}
              onChange={e => onIssue(e.target.value)}
              onFocus={() => onFocusChange(true)}
              onBlur={() => onFocusChange(false)}
            />
            <div className="input-group-append" onClick={commit}>
              <button className="btn btn-outline-secondary" type="button">
                <Check size={20} />
              </button>
            </div>
          </div>
        ) : (
          <div className="input-group">
            <input
              type="text"
              placeholder="Current issue"
              className="form-control"
              value={issue}
              readOnly
            />
            <div className="input-group-append" onClick={() => setEditing(true)}>
              <button className="btn btn-outline-secondary" type="button">
                <Pencil size={20} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

`frontend/src/components/Deck.tsx`:

```tsx
import { Lock } from 'lucide-react'
import type { View } from '../room/view'

const estimationValues = ['0', '0.5', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?']

type Props = { view: View; onVote: (estimation: string) => void }

export function Deck({ view, onVote }: Props) {
  const cardClass = (e: string) => {
    if (e !== view.userEstimation) return 'btn estimation-button m-1'
    return view.ownVoteConfirmed
      ? 'btn estimation-button estimation-button-selected m-1'
      : 'btn estimation-button estimation-button-uncomfirmed m-1'
  }
  return (
    <div className="row">
      <div className="col">
        <div className="lt-dark-red-bg estimation-card">
          <div className="row">
            <div className="col mt-2">
              <h6>Your estimation</h6>
            </div>
          </div>
          <div className="row">
            <div className="col mt-2">
              <div className="estimation-text">{view.userEstimation}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="col">
        <div className="row">
          {estimationValues.map(e => (
            <div className="col" key={e}>
              <button
                type="button"
                className={cardClass(e)}
                disabled={view.votesRevealed}
                onClick={() => onVote(e)}
              >
                {e}
              </button>
            </div>
          ))}
        </div>
        {/* Hidden rather than absent: its row sizes the estimation card, so removing it
            resizes the card and shifts every row below on each reveal. */}
        <div className="row" style={{ visibility: view.votesRevealed ? 'visible' : 'hidden' }}>
          <div className="col text-muted m-1">
            <Lock size={20} />
            <small>The round is revealed. Press Re-vote to open it again.</small>
          </div>
        </div>
      </div>
    </div>
  )
}
```

`frontend/src/components/Controls.tsx`:

```tsx
type Props = { revealed: boolean; onShow: () => void; onRevote: () => void; onClear: () => void }

export function Controls({ revealed, onShow, onRevote, onClear }: Props) {
  return (
    <div className="row mt-4">
      <div className="col">
        <div className="d-flex flex-row align-items-start">
          <div className="mr-auto">
            <button type="button" className="btn show-bt" onClick={onShow}>
              Show votes
            </button>
          </div>
          {revealed && (
            <div className="mx-2">
              <button type="button" className="btn revote-bt" onClick={onRevote}>
                Re-vote
              </button>
            </div>
          )}
          <div className="ml-auto">
            <button type="button" className="btn clear-bt" onClick={onClear}>
              Clear votes
            </button>
          </div>
        </div>
      </div>
      <div className="col"></div>
    </div>
  )
}
```

`frontend/src/components/Results.tsx`:

```tsx
import type { View } from '../room/view'

export function Results({ view }: { view: View }) {
  // The length guard is not defensive: the tally is empty after a Show where nobody voted.
  if (!view.votesRevealed || view.votesSummary.length === 0) return null
  return (
    <div className="row mt-4">
      <div className="col">
        <div className="summary-card">
          <div className="row">
            <div className="col mt-2">
              <h6>Most voted estimation</h6>
            </div>
          </div>
          <div className="row">
            <div className="col">
              <div className="estimation-text">{view.votesSummary[0][0]}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="col">
        <table className="table table-hover">
          <thead>
            <tr>
              <th>Estimation</th>
              <th>Number of votes</th>
            </tr>
          </thead>
          <tbody>
            {view.votesSummary.map(([estimation, count]) => (
              <tr key={estimation}>
                <td>{estimation}</td>
                <td>{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

`frontend/src/components/Participants.tsx`:

```tsx
import { CircleCheck, ShieldOff } from 'lucide-react'
import type { View } from '../room/view'

export function Participants({ view }: { view: View }) {
  return (
    <div className="row mt-4">
      <div className="col-md-12">
        <table className="table table-hover">
          <thead>
            <tr>
              <th>Voted</th>
              <th>Name</th>
              <th>Estimation</th>
            </tr>
          </thead>
          <tbody>
            {view.users.map(u => (
              <tr key={u.id}>
                <td>{u.voted && <CircleCheck size={20} />}</td>
                <td>{u.name}</td>
                <td>
                  {u.hasEstimation && !view.votesRevealed && <ShieldOff size={20} />}
                  {view.votesRevealed && <div>{u.estimation}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run every check, then the whole browser suite**

```bash
npm run typecheck && npm run lint && npm run test:unit
npm run build && grep -c 'https://' frontend/dist/index.html   # expect 0
npm run e2e
```

Expected: all green. The e2e suite passes in both browsers with no selector change, 70 cases plus the four new lobby runs.

- [ ] **Step 5: Prove the guard and the trim case can fail**

1. Add `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/x@1/x.css">` after the `<title>` in `frontend/index.html`, run `npm run build && npx playwright test e2e/smoke.spec.js e2e/room.spec.js:21 --project chromium`, and confirm both fail with "requests to a host other than 127.0.0.1" listing that URL. The second case uses the `join` fixture, so this also proves the guard covers `join`'s contexts. Remove the link.
2. Change `const id = roomId.trim()` to `const id = roomId` in `App.tsx`, run `npm run build && npx playwright test e2e/lobby.spec.js --project chromium`, and confirm only the paste case fails. Restore it and rebuild.

- [ ] **Step 6: Commit**

```bash
git add frontend e2e playwright.config.js .github/dependabot.yml package.json package-lock.json
git commit -m "feat(frontend): replace the Vue page with React components"
```

---

### Task 5: Type the API client from tapir's OpenAPI document

**Files:**
- Create: `src/main/scala/com/lunatech/pointingpoker/Endpoints.scala`, `src/test/scala/com/lunatech/pointingpoker/OpenApiDocs.scala`, `frontend/src/protocol/generated/openapi.json`, `frontend/src/protocol/generated/openapi.d.ts`
- Modify: `src/main/scala/com/lunatech/pointingpoker/API.scala`, `build.sbt`, `package.json`, `package-lock.json`, `frontend/src/protocol/api.ts`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Task 3's `api.ts` signatures, kept exactly.
- Produces: `Endpoints.{createRoom, join, events, vote, show, clear, revote, editIssue, leave, all, SessionCookieName}`; `sbt genOpenApi`; `npm run gen:api`.

- [ ] **Step 1: Move the endpoint descriptions to `Endpoints`, with no behaviour change**

Create `src/main/scala/com/lunatech/pointingpoker/Endpoints.scala`:

```scala
package com.lunatech.pointingpoker

import com.lunatech.pointingpoker.actors.Room
import com.lunatech.pointingpoker.slug.Slug
import sttp.capabilities.pekko.PekkoStreams
import sttp.model.StatusCode
import sttp.tapir.*
import sttp.tapir.json.circe.*
import sttp.tapir.server.pekkohttp.PekkoServerSentEvents
import java.nio.charset.StandardCharsets

// Descriptions only, so the OpenAPI document can be generated without an actor system.
object Endpoints:

  val SessionCookieName = "session"

  // EventSource sets no headers, so the stream rides a text body tapir serialises for us.
  private val sseBody =
    streamTextBody(PekkoStreams)(CodecFormat.TextEventStream(), Some(StandardCharsets.UTF_8))
      .map(PekkoServerSentEvents.parseBytesToSSE)(PekkoServerSentEvents.serialiseSSEToBytes)

  // Mismatch, not Error: tapir answers an error with 400 but tries the next endpoint on a mismatch.
  private given Codec[String, Slug, CodecFormat.TextPlain] =
    Codec.string.mapDecode(raw =>
      Slug
        .parse(raw)
        .map(DecodeResult.Value(_))
        .getOrElse(DecodeResult.Mismatch("a room name", raw))
    )(_.raw)

  private val roomPath = "rooms" / path[Slug]("roomId")

  private val sessionIn = cookie[Option[String]](SessionCookieName)

  val createRoom = endpoint.post
    .in("create-room")
    .out(stringBody)
    .errorOut(statusCode(StatusCode.ServiceUnavailable))

  val join = endpoint.post
    .in(roomPath / "join")
    .in(sessionIn)
    .in(jsonBody[JoinRequest])
    .out(statusCode(StatusCode.NoContent))
    .out(setCookie(SessionCookieName))

  private given Codec[String, Room.ConnectionId, CodecFormat.TextPlain] =
    Codec.string.mapDecode(raw =>
      Room.ConnectionId
        .parse(raw)
        .map(DecodeResult.Value(_))
        .getOrElse(DecodeResult.Mismatch("a UUID", raw))
    )(_.raw)

  val events = endpoint.get
    .in(roomPath / "events")
    .in(query[Room.ConnectionId]("connectionId"))
    .in(sessionIn)
    .in(header[Option[String]]("X-Forwarded-Proto"))
    .out(sseBody)
    .out(header("Cache-Control", "no-cache"))
    // Proxies that buffer a response body turn SSE into batches or silence;
    // X-Accel-Buffering is nginx's opt-out and README records the rest.
    .out(header("X-Accel-Buffering", "no"))
    .errorOut(statusCode(StatusCode.Unauthorized))

  // Exhaustive, and the build makes a missed case fatal: every refusal has exactly one status.
  private def status(refusal: Room.Refusal | Room.VoteRefusal): StatusCode = refusal match
    case Room.NoSession       => StatusCode.Unauthorized
    case Room.NotAMember      => StatusCode.Forbidden
    case Room.RoundRevealed   => StatusCode.Conflict
    case Room.BlankEstimation => StatusCode.BadRequest

  // Built from the enums' values, so a new refusal cannot be left without a variant.
  private def errors[R <: Room.Refusal | Room.VoteRefusal](refusals: Seq[R]) =
    val variants = refusals.map(r => oneOfVariantSingletonMatcher(status(r))(r))
    oneOf[R](variants.head, variants.tail*)

  private val commandErrors = errors(Room.Refusal.values.toSeq)
  private val voteErrors    = errors(Room.Refusal.values.toSeq ++ Room.VoteRefusal.values)

  private def command(segment: String) = endpoint.post
    .in(roomPath / segment)
    .in(sessionIn)
    .out(statusCode(StatusCode.NoContent))
    .errorOut(commandErrors)

  val vote = endpoint.post
    .in(roomPath / "vote")
    .in(sessionIn)
    .in(jsonBody[VoteRequest])
    .out(statusCode(StatusCode.NoContent))
    .errorOut(voteErrors)

  val show      = command("show")
  val clear     = command("clear")
  val revote    = command("revote")
  val editIssue = command("edit-issue").in(jsonBody[EditIssueRequest])

  val leave = endpoint.post
    .in(roomPath / "leave")
    .in(query[Room.ConnectionId]("connectionId"))
    .in(sessionIn)
    .out(statusCode(StatusCode.NoContent))
    .errorOut(commandErrors)

  val all: List[AnyEndpoint] =
    List(createRoom, join, events, vote, show, clear, revote, editIssue, leave)
end Endpoints
```

In `API.scala`:

- Delete `private val SessionCookieName = "session"`, and the whole block from `// EventSource sets no headers` through the `leave` endpoint description. The block is exactly the text now in `Endpoints.scala`, where it was private.
- Prefix each of the nine `serverLogic` receivers with `Endpoints.`, as in `Endpoints.createRoom.serverLogic[Future] { _ =>`.
- Delete the imports that are no longer used: `sttp.capabilities.pekko.PekkoStreams`, `sttp.model.StatusCode`, `sttp.tapir.*`, `sttp.tapir.json.circe.*` and `java.nio.charset.StandardCharsets`. Change `import sttp.tapir.server.pekkohttp.{PekkoHttpServerInterpreter, PekkoServerSentEvents}` to `import sttp.tapir.server.pekkohttp.PekkoHttpServerInterpreter`.

`sessionCookie`, `answer`, `answerVote`, `resolveToken`, `route` and `run` are unchanged.

Run: `git add src/main/scala/com/lunatech/pointingpoker/Endpoints.scala && sbt scalafmtAll test`
Expected: PASS with Task 1's count, and no test changed.

- [ ] **Step 2: Add the generator and the alias**

In `build.sbt`, after the `pekko-http-testkit` line:

```scala
    libraryDependencies += "com.softwaremill.sttp.tapir" %% "tapir-openapi-docs" % V.tapir % Test,
    libraryDependencies += "com.softwaremill.sttp.apispec" %% "openapi-circe" % "0.11.10" % Test,
```

and after the `qa` alias:

```scala
addCommandAlias(
  "genOpenApi",
  "Test/runMain com.lunatech.pointingpoker.writeOpenApi frontend/src/protocol/generated/openapi.json"
)
```

(0.11.10 is the `openapi-model` version `tapir-openapi-docs` 1.13.31 depends on; `sbt evicted` showed no apispec conflict.)

Create `src/test/scala/com/lunatech/pointingpoker/OpenApiDocs.scala`:

```scala
package com.lunatech.pointingpoker

import io.circe.Printer
import io.circe.syntax.*
import sttp.apispec.openapi.circe.*
import sttp.tapir.docs.openapi.OpenAPIDocsInterpreter

import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Paths}

// Writes the OpenAPI document for Endpoints.all; run through the genOpenApi alias.
@main def writeOpenApi(path: String): Unit =
  val docs    = OpenAPIDocsInterpreter().toOpenAPI(Endpoints.all, "Pointing Poker", "1")
  val printer = Printer.spaces2.copy(dropNullValues = true)
  val target  = Paths.get(path).toAbsolutePath
  Files.createDirectories(target.getParent)
  Files.writeString(target, printer.print(docs.asJson) + "\n", StandardCharsets.UTF_8)
  println(s"Wrote $target")
```

In `package.json`'s scripts, add:

```json
    "gen:api": "openapi-typescript frontend/src/protocol/generated/openapi.json -o frontend/src/protocol/generated/openapi.d.ts",
```

```bash
npm install --save-dev --no-audit --no-fund openapi-typescript@7.13.0
git add src/test/scala/com/lunatech/pointingpoker/OpenApiDocs.scala
sbt scalafmtAll scalafmtSbt genOpenApi && npm run gen:api
sbt genOpenApi && git diff --stat   # a second run changes nothing
```

Expected: `openapi.json` lists nine paths, from `/create-room` to `/rooms/{roomId}/leave`, with the schemas `EditIssueRequest`, `JoinRequest` and `VoteRequest`. The second generation leaves no diff.

- [ ] **Step 3: Rewrite `api.ts` over `openapi-fetch`, keeping every signature**

```bash
npm uninstall --no-audit --no-fund axios
npm install --no-audit --no-fund openapi-fetch@0.17.0
```

`frontend/src/protocol/api.ts`, whole file:

```ts
import createClient from 'openapi-fetch'
import type { paths } from './generated/openapi'

const client = createClient<paths>()

// Every call rejects on a failure, so a component's catch is the one place a failure lands.
export type JoinOutcome = 'joined' | 'not-a-room'

const refused = (what: string, response: Response) =>
  new Error(`${what} answered ${response.status}`)

export async function createRoom(): Promise<string> {
  const { data, response } = await client.POST('/create-room', { parseAs: 'text' })
  if (data === undefined) throw refused('create-room', response)
  return data
}

export async function join(roomId: string, name: string): Promise<JoinOutcome> {
  const { response } = await client.POST('/rooms/{roomId}/join', {
    params: { path: { roomId } },
    body: { name }
  })
  // Only a typed or remembered name reaches /join unchecked; the page route answers it.
  if (response.status === 404) return 'not-a-room'
  if (!response.ok) throw refused('join', response)
  return 'joined'
}

export type Command = 'show' | 'clear' | 'revote'

export async function command(roomId: string, name: Command): Promise<void> {
  const path = `/rooms/{roomId}/${name}` as const
  const { response } = await client.POST(path, { params: { path: { roomId } } })
  if (!response.ok) throw refused(name, response)
}

export async function vote(roomId: string, estimation: string): Promise<void> {
  const { response } = await client.POST('/rooms/{roomId}/vote', {
    params: { path: { roomId } },
    body: { estimation }
  })
  if (!response.ok) throw refused('vote', response)
}

export async function editIssue(roomId: string, issue: string): Promise<void> {
  const { response } = await client.POST('/rooms/{roomId}/edit-issue', {
    params: { path: { roomId } },
    body: { issue }
  })
  if (!response.ok) throw refused('edit-issue', response)
}
```

- [ ] **Step 4: Add the regenerate gate to CI**

In `.github/workflows/ci.yml`, after the `frontend unit tests` step:

```yaml
      # The generated types are committed, so an endpoint change must regenerate them in its PR.
      - name: generated API types are current
        run: |
          sbt genOpenApi
          npm run gen:api
          if [ -n "$(git status --porcelain -- frontend/src/protocol/generated)" ]; then
            git diff -- frontend/src/protocol/generated
            exit 1
          fi
```

- [ ] **Step 5: Run every check, then prove the types and the gate can fail**

```bash
npm run typecheck && npm run lint && npm run test:unit && sbt test && npm run e2e
```

Expected: all green, the e2e suite as in Task 4.

Then:

1. In `api.ts`, change `body: { issue }` to `body: { isue: issue }`, run `npm run typecheck`, and confirm TS2561 ("'isue' does not exist"). Restore it.
2. In `Requests.scala`, rename `JoinRequest`'s field `name` to `nickname`, run `sbt genOpenApi && npm run gen:api && npm run typecheck`, and confirm that `git status` shows both generated files modified and that `tsc` fails in `api.ts`'s `join`. Then `git checkout -- src/main/scala frontend/src/protocol/generated`.

- [ ] **Step 6: Commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/Endpoints.scala src/main/scala/com/lunatech/pointingpoker/API.scala src/test/scala/com/lunatech/pointingpoker/OpenApiDocs.scala build.sbt frontend package.json package-lock.json .github/workflows/ci.yml
git commit -m "feat(frontend): type the API client from tapir's OpenAPI document"
```

---

### Task 6: Check server snapshots against the strict client schema

**Files:**
- Create: `src/test/scala/com/lunatech/pointingpoker/actors/SnapshotContractSpec.scala`, `frontend/src/protocol/snapshot.contract.test.ts`

**Interfaces:**
- Consumes: `RoomSnapshot.of`, the production `Encoder[RoomSnapshot]`, `RoomDataFixtures`; Task 3's `strictSnapshotSchema`.
- Produces: `target/contract/<state>.json`, emptied and rewritten by every `sbt test`; Task 7 adds states.

- [ ] **Step 1: Write the Vitest reader, and watch it fail on nothing**

`frontend/src/protocol/snapshot.contract.test.ts`:

```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { strictSnapshotSchema } from './snapshot'

// Written by SnapshotContractSpec through the production encoder; sbt test empties and refills it.
const dir = fileURLToPath(new URL('../../../target/contract/', import.meta.url))
const states = existsSync(dir) ? readdirSync(dir).filter(file => file.endsWith('.json')) : []

describe('the snapshot contract', () => {
  it('has server snapshots to check', () => {
    expect(states, `no snapshots in ${dir}: run sbt test first`).not.toHaveLength(0)
  })

  it.each(states)('parses %s with the strict schema', file => {
    const parsed = strictSnapshotSchema.safeParse(JSON.parse(readFileSync(dir + file, 'utf8')))
    expect(parsed.error?.issues ?? []).toEqual([])
  })
})
```

Run: `rm -rf target/contract && npm run test:unit`
Expected: FAIL with "no snapshots in .../target/contract/: run sbt test first".

- [ ] **Step 2: Write the Scala writer**

`src/test/scala/com/lunatech/pointingpoker/actors/SnapshotContractSpec.scala`:

```scala
package com.lunatech.pointingpoker.actors

import java.nio.file.{Files, Path, Paths}
import java.util.UUID

import scala.jdk.CollectionConverters.*

import io.circe.syntax.*
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.testkit.TestProbe
import org.scalatest.BeforeAndAfterAll
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

import com.lunatech.pointingpoker.actors.RoomDataFixtures.*

class SnapshotContractSpec extends AnyWordSpec with must.Matchers with BeforeAndAfterAll:

  given system: ActorSystem = ActorSystem("SnapshotContractSpec")

  // sbt forks the test JVM at the repo root, so this lands beside the build's own target.
  private val contractDir: Path = Paths.get("target", "contract")

  // Emptied once before any case, so a state removed from this spec leaves no file behind.
  override def beforeAll(): Unit =
    Files.createDirectories(contractDir)
    Files.list(contractDir).iterator().asScala.foreach(Files.delete)

  override def afterAll(): Unit =
    system.terminate()

  // Fixed ids keep each file byte-stable across runs, so a contract change shows as a diff.
  private val ids = Map("Alice" -> 1, "Bob" -> 2)

  private def user(name: String, voted: Boolean, estimation: String): Attendee =
    val id = UUID.fromString(f"00000000-0000-0000-0000-${ids(name)}%012d")
    Attendee(id, name, voted, estimation, TestProbe().ref, Room.SessionToken.mint())

  final private case class ContractState(name: String, snapshot: () => RoomSnapshot)

  private val states: List[ContractState] = List(
    ContractState(
      "before-reveal",
      () =>
        val alice = user("Alice", true, "5")
        RoomSnapshot.of(withUsers(alice, user("Bob", true, "13")).withIssue("PP-1"), alice.id)
    ),
    ContractState(
      "after-reveal",
      () =>
        val alice = user("Alice", true, "5")
        val data  = withUsers(alice, user("Bob", true, "13")).withIssue("PP-1").withRevealed()
        RoomSnapshot.of(data, alice.id)
    ),
    ContractState(
      "empty-issue",
      () =>
        val alice = user("Alice", false, "")
        RoomSnapshot.of(withUsers(alice).withIssue(""), alice.id)
    )
  )

  "The snapshot contract" should {
    for state <- states do
      s"write a representative snapshot for ${state.name}" in {
        Files.writeString(contractDir.resolve(s"${state.name}.json"), state.snapshot().asJson.spaces2)
      }
  }
end SnapshotContractSpec
```

One case per state, so a failure names its state. Filtering to one case with `-z` still runs `beforeAll` and leaves only that file, which is acceptable since a filtered run is not how the contract is produced.

- [ ] **Step 3: Run both halves, then prove the pair can fail**

```bash
git add src/test/scala/com/lunatech/pointingpoker/actors/SnapshotContractSpec.scala
sbt scalafmtAll "testOnly *SnapshotContractSpec" && ls target/contract
npm run test:unit
```

Expected: three files; Vitest PASS, the contract cases included.

Then:

1. Add a field to `RoomSnapshot`, `history: List[String] = Nil`, run `sbt "testOnly *SnapshotContractSpec" && npm run test:unit`, and confirm every contract case fails with `unrecognized_keys` naming `history`. Revert it.
2. `echo '{}' > target/contract/stale.json && sbt "testOnly *SnapshotContractSpec" && ls target/contract`: `stale.json` is gone.

- [ ] **Step 4: Run the suites and commit**

```bash
sbt test && npm run test:unit
git add src/test/scala/com/lunatech/pointingpoker/actors/SnapshotContractSpec.scala frontend/src/protocol/snapshot.contract.test.ts
git commit -m "test(contract): check server snapshots against the strict client schema"
```

---

### Task 7: Carry the estimation as a tagged union

`voted`, `hasEstimation` and `estimation` admit eight combinations, of which five are legal. They become one `estimation` field holding one of five tags. It is its own commit, so the wire change is reviewed as a contract diff.

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomSnapshot.scala`, `frontend/src/protocol/snapshot.ts`, `frontend/src/room/view.ts`
- Test: `RoomSnapshotSpec.scala`, `RoomDataFixtures.scala`, `RoomSpec.scala`, `SSESpec.scala`, `SnapshotContractSpec.scala`, `frontend/src/protocol/snapshot.test.ts`, `frontend/src/room/view.test.ts`, `frontend/src/room/connection.test.ts`

**Interfaces:**
- Produces: `RoomSnapshot.Estimation` with cases `NoEstimation`, `ConfirmedHidden`, `UnconfirmedHidden`, `Confirmed(value)`, `Unconfirmed(value)`, and `Estimation.of(estimate: Option[Room.Estimate], disclose: Boolean)`; on the wire, `{"type":"ConfirmedHidden"}` or `{"type":"Confirmed","value":"5"}`; the TypeScript `type Estimation`. `View` and `ParticipantRow` keep their shape, so no component changes.

- [ ] **Step 1: Rewrite the Scala specs against the union, and watch them fail to compile**

Add to `RoomDataFixtures.scala` the import `import com.lunatech.pointingpoker.actors.RoomSnapshot.Estimation` and, after the `RoomData` extension:

```scala
  // The pre-union wire's three fields, rebuilt so behaviour specs need not name every tag.
  extension (participant: RoomSnapshot.Participant)
    def voted: Boolean = participant.estimation match
      case Estimation.Confirmed(_) | Estimation.ConfirmedHidden => true
      case _                                                    => false

    def hasEstimation: Boolean = participant.estimation != Estimation.NoEstimation

    def shown: String = participant.estimation match
      case Estimation.Confirmed(value)   => value
      case Estimation.Unconfirmed(value) => value
      case _                             => ""
  end extension
```

In `RoomSpec.scala`, change each snapshot `.estimation` compared to a string into `.shown`. There are six sites, each in the case named:

- "clear votes and publish the cleared room": `snapshot.users.map(u => (u.voted, u.shown))`.
- "revote and publish a room that keeps the estimations but clears the votes": the `find` and `filterNot` lines, both `.map(_.shown)`.
- "vote and publish it to everyone": `voter.map(_.shown)`.
- "publish the whole room to a joiner and to everyone already in it": `joinerView.users.filterNot(...).map(_.shown)`.
- "publish on a refused vote, the same as on one that lands": `snapshot.users.map(_.shown)`.

Its `.voted` and `.hasEstimation` calls now resolve to the extensions unchanged.

In `SSESpec.scala`'s `snapshot` helper, replace the three fields `voted = false`, `hasEstimation = false` and `estimation = ""` with `estimation = RoomSnapshot.Estimation.NoEstimation`.

In `RoomSnapshotSpec.scala`, add the imports `import io.circe.Json` and `import com.lunatech.pointingpoker.actors.RoomSnapshot.Estimation`, then apply these edits. They were run in the spike; context lines are unchanged.

```diff
@@ "serialize exactly the agreed field set"
       json.hcursor.downField("users").downArray.keys.map(_.toList) mustBe Some(
-        List("id", "name", "voted", "hasEstimation", "estimation")
+        List("id", "name", "estimation")
+      )
+      json.hcursor.downField("users").downArray.downField("estimation").focus mustBe Some(
+        Json.obj("type" -> Json.fromString("Confirmed"), "value" -> Json.fromString("5"))
       )
@@ "withhold another participant's estimation until the room reveals"
-      forAlice.users.find(_.id == alice.id).map(_.estimation) mustBe Some("5")
-      forAlice.users.find(_.id == bob.id).map(_.estimation) mustBe Some("")
+      forAlice.users.find(_.id == alice.id).map(_.estimation) mustBe Some(Estimation.Confirmed("5"))
+      forAlice.users.find(_.id == bob.id).map(_.estimation) mustBe Some(Estimation.ConfirmedHidden)
 
       val forBob = RoomSnapshot.of(data, bob.id)
-      forBob.users.find(_.id == bob.id).map(_.estimation) mustBe Some("13")
-      forBob.users.find(_.id == alice.id).map(_.estimation) mustBe Some("")
+      forBob.users.find(_.id == bob.id).map(_.estimation) mustBe Some(Estimation.Confirmed("13"))
+      forBob.users.find(_.id == alice.id).map(_.estimation) mustBe Some(Estimation.ConfirmedHidden)
@@ "keep a withheld estimation out of the serialized frame entirely"
-      // The key stays, empty: the wire keeps estimation a String that is always present.
+      // The key stays, as a tag with no value: the wire keeps estimation always present.
       rows.flatMap(_.asObject.map(_.keys.toList)) mustBe List.fill(2)(
-        List("id", "name", "voted", "hasEstimation", "estimation")
+        List("id", "name", "estimation")
+      )
+      val bobsRow = rows.find(_.hcursor.get[UUID]("id").toOption.contains(bob.id))
+      bobsRow.flatMap(_.hcursor.downField("estimation").focus) mustBe Some(
+        Json.obj("type" -> Json.fromString("ConfirmedHidden"))
       )
@@ "hand every estimation over once the room has revealed"
-      RoomSnapshot.of(data, alice.id).users.map(_.estimation).toSet mustBe Set("5", "13")
+      RoomSnapshot.of(data, alice.id).users.map(_.estimation).toSet mustBe
+        Set(Estimation.Confirmed("5"), Estimation.Confirmed("13"))
@@ "say that another participant has an estimation without saying what it is"
       // Computed from the unredacted value, so the hidden-value icon renders as it does today.
-      bobsRow.map(_.hasEstimation) mustBe Some(true)
-      bobsRow.map(_.estimation) mustBe Some("")
-      RoomSnapshot.of(data, alice.id).users.find(_.id == alice.id).map(_.hasEstimation) mustBe
-        Some(false)
+      bobsRow.map(_.estimation) mustBe Some(Estimation.ConfirmedHidden)
+      RoomSnapshot.of(data, alice.id).users.find(_.id == alice.id).map(_.estimation) mustBe
+        Some(Estimation.NoEstimation)
@@ "distinguish a re-vote from a clear on another participant's row"
-      // voted false with hasEstimation true is the re-vote state, and it has to survive
-      // redaction or every row looks cleared.
-      snapshot.users.find(_.id == revoting.id).map(_.hasEstimation) mustBe Some(true)
-      snapshot.users.find(_.id == cleared.id).map(_.hasEstimation) mustBe Some(false)
+      // UnconfirmedHidden is the re-vote state, and it has to survive redaction or every
+      // row looks cleared.
+      snapshot.users.find(_.id == revoting.id).map(_.estimation) mustBe
+        Some(Estimation.UnconfirmedHidden)
+      snapshot.users.find(_.id == cleared.id).map(_.estimation) mustBe
+        Some(Estimation.NoEstimation)
@@ "withhold every estimation from a snapshot built for someone who is not a member"
-      RoomSnapshot.of(data, UUID.randomUUID()).users.map(_.estimation) mustBe List("", "")
+      RoomSnapshot.of(data, UUID.randomUUID()).users.map(_.estimation) mustBe
+        List(Estimation.ConfirmedHidden, Estimation.ConfirmedHidden)
@@ "disclose every estimation to a non-member once the room has revealed"
-      RoomSnapshot.of(data, UUID.randomUUID()).users.map(_.estimation).toSet mustBe Set("5", "13")
+      RoomSnapshot.of(data, UUID.randomUUID()).users.map(_.estimation).toSet mustBe
+        Set(Estimation.Confirmed("5"), Estimation.Confirmed("13"))
@@ "count an entry in the round as an estimation, however the value reads"
-      // hasEstimation is the entry existing, not a non-empty string on the participant.
+      // An estimation is the entry existing, not a non-empty string on the participant.
       val rows = RoomSnapshot.of(data, alice.id).users
-      rows.find(_.id == alice.id).map(_.hasEstimation) mustBe Some(true)
-      rows.find(_.id == bob.id).map(_.hasEstimation) mustBe Some(false)
+      rows.find(_.id == alice.id).map(_.estimation) mustBe Some(Estimation.Confirmed("5"))
+      rows.find(_.id == bob.id).map(_.estimation) mustBe Some(Estimation.NoEstimation)
     }
+
+    "give each participant the one tag its confirmation and disclosure call for" in {
+      val alice       = user(UUID.randomUUID(), "Alice", false, "3")
+      val confirmed   = user(UUID.randomUUID(), "Confirmed", true, "5")
+      val unconfirmed = user(UUID.randomUUID(), "Unconfirmed", false, "8")
+      val none        = user(UUID.randomUUID(), "None", false, "")
+      val data        = withUsers(alice, confirmed, unconfirmed, none)
+
+      def tags(snapshot: RoomSnapshot): Map[UUID, Estimation] =
+        snapshot.users.map(p => p.id -> p.estimation).toMap
+
+      // The reader re-voting sees her own value, unconfirmed; the rest stay hidden.
+      tags(RoomSnapshot.of(data, alice.id)) mustBe Map(
+        alice.id       -> Estimation.Unconfirmed("3"),
+        confirmed.id   -> Estimation.ConfirmedHidden,
+        unconfirmed.id -> Estimation.UnconfirmedHidden,
+        none.id        -> Estimation.NoEstimation
+      )
+      // Show after a partial re-vote discloses an unconfirmed value without confirming it.
+      tags(RoomSnapshot.of(data.withRevealed(), alice.id)) mustBe Map(
+        alice.id       -> Estimation.Unconfirmed("3"),
+        confirmed.id   -> Estimation.Confirmed("5"),
+        unconfirmed.id -> Estimation.Unconfirmed("8"),
+        none.id        -> Estimation.NoEstimation
+      )
+    }
```

In `SnapshotContractSpec.scala`, give each state an optional tag it must contain, and add one state per tag. Replace `ContractState` and everything after it with:

```scala
  // tag, when set, must appear as some participant's estimation type, so a name cannot lie.
  final private case class ContractState(
      name: String,
      snapshot: () => RoomSnapshot,
      tag: Option[String] = None
  )

  // Alice reads; Bob, when present, holds the state under test.
  private def tagState(name: String, tag: String, data: (Attendee, Attendee) => Room.RoomData) =
    ContractState(
      name,
      () =>
        val alice = user("Alice", false, "")
        RoomSnapshot.of(data(alice, user("Bob", false, "")), alice.id)
      ,
      Some(tag)
    )

  private val states: List[ContractState] = List(
    ContractState(
      "before-reveal",
      () =>
        val alice = user("Alice", true, "5")
        RoomSnapshot.of(withUsers(alice, user("Bob", true, "13")).withIssue("PP-1"), alice.id)
    ),
    ContractState(
      "after-reveal",
      () =>
        val alice = user("Alice", true, "5")
        val data  = withUsers(alice, user("Bob", true, "13")).withIssue("PP-1").withRevealed()
        RoomSnapshot.of(data, alice.id)
    ),
    ContractState(
      "empty-issue",
      () =>
        val alice = user("Alice", false, "")
        RoomSnapshot.of(withUsers(alice).withIssue(""), alice.id)
    ),
    tagState("estimation-no-estimation", "NoEstimation", (alice, _) => withUsers(alice)),
    tagState(
      "estimation-confirmed-hidden",
      "ConfirmedHidden",
      (alice, bob) => withUsers(alice, bob.copy(voted = true, estimation = "13"))
    ),
    tagState(
      "estimation-unconfirmed-hidden",
      "UnconfirmedHidden",
      (alice, bob) => withUsers(alice, bob.copy(estimation = "13"))
    ),
    tagState(
      "estimation-confirmed",
      "Confirmed",
      (alice, _) => withUsers(alice.copy(voted = true, estimation = "5"))
    ),
    tagState(
      "estimation-unconfirmed",
      "Unconfirmed",
      (alice, _) => withUsers(alice.copy(estimation = "5"))
    )
  )

  "The snapshot contract" should {
    for state <- states do
      s"write a representative snapshot for ${state.name}" in {
        val json = state.snapshot().asJson
        val tags = json.hcursor
          .downField("users")
          .values
          .toList
          .flatten
          .flatMap(_.hcursor.downField("estimation").get[String]("type").toOption)
        state.tag.foreach(tag => tags must contain(tag))
        Files.writeString(contractDir.resolve(s"${state.name}.json"), json.spaces2)
      }
  }
end SnapshotContractSpec
```

(scalafmt leaves the comma in `tagState` alone on its line, after the braceless lambda. That is its layout, and it passes the style check.)

Run: `sbt Test/compile`
Expected: FAIL to compile, since `RoomSnapshot.Estimation` does not exist.

- [ ] **Step 2: Implement the union in `RoomSnapshot`**

Replace `RoomSnapshot.scala`'s imports and its `object RoomSnapshot` down to the `given Encoder[RoomSnapshot]` with the following, and replace the `.map { (id, member) => ... }` body in `of` as shown:

```scala
import java.util.UUID

import io.circe.{Encoder, Json}
import io.circe.generic.semiauto.deriveEncoder

import com.lunatech.pointingpoker.actors.Room.RoomData
```

```scala
object RoomSnapshot:

  // A projection rather than Room.Member: a derived encoder over the room's own state would
  // put every participant's session token on the wire to every other participant.
  final case class Participant(id: UUID, name: String, estimation: Estimation)

  // One tag per reachable pair of (confirmed, disclosed), so the wire cannot carry a value
  // alongside a hidden flag, nor a "voted" with no estimation.
  enum Estimation:
    case NoEstimation, ConfirmedHidden, UnconfirmedHidden
    case Confirmed(value: String)
    case Unconfirmed(value: String)

  object Estimation:
    // Explicit tags rather than toString: renaming a case must not silently rename the wire.
    given Encoder[Estimation] = Encoder.instance {
      case NoEstimation       => tagged("NoEstimation")
      case ConfirmedHidden    => tagged("ConfirmedHidden")
      case UnconfirmedHidden  => tagged("UnconfirmedHidden")
      case Confirmed(value)   => tagged("Confirmed", "value" -> Json.fromString(value))
      case Unconfirmed(value) => tagged("Unconfirmed", "value" -> Json.fromString(value))
    }

    private def tagged(tag: String, fields: (String, Json)*): Json =
      Json.obj(("type" -> Json.fromString(tag)) +: fields*)

    def of(estimate: Option[Room.Estimate], disclose: Boolean): Estimation =
      // A tuple rather than guards, so the compiler checks all four pairs are covered.
      estimate.fold(NoEstimation)(e =>
        (e.confirmed, disclose) match
          case (true, true)   => Confirmed(e.value)
          case (true, false)  => ConfirmedHidden
          case (false, true)  => Unconfirmed(e.value)
          case (false, false) => UnconfirmedHidden
      )
  end Estimation

  object Participant:
    given Encoder[Participant] = deriveEncoder[Participant]
```

```scala
        .map { (id, member) =>
          val disclose = round.revealed || id == forUser
          Participant(id, member.name, Estimation.of(round.estimates.get(id), disclose))
        }
```

Run: `sbt scalafmtAll test`
Expected: PASS (215 in the spike).

Prove it can fail: make `ConfirmedHidden` encode as `tagged("ConfirmedHidden", "value" -> Json.fromString(""))`, run `sbt test`, confirm only "keep a withheld estimation out of the serialized frame entirely" fails, then run `npm run test:unit` and confirm the contract case for `estimation-confirmed-hidden.json` fails with `unrecognized_keys`, the second place that catches it. Restore the encoder.

At this point the page is broken against the new wire (`npm run test:unit` fails on every contract file), which is what the contract test is for. Step 3 fixes the client.

- [ ] **Step 3: Read the union on the client**

In `frontend/src/protocol/snapshot.ts`, replace the `participant` definition with:

```ts
  // The five legal states; value only where the reader may see it.
  const estimation = z.discriminatedUnion('type', [
    object({ type: z.literal('NoEstimation') }),
    object({ type: z.literal('ConfirmedHidden') }),
    object({ type: z.literal('UnconfirmedHidden') }),
    object({ type: z.literal('Confirmed'), value: z.string() }),
    object({ type: z.literal('Unconfirmed'), value: z.string() })
  ])
  const participant = object({ id: z.string(), name: z.string(), estimation })
```

and after the `Participant` type add:

```ts
export type Estimation = Participant['estimation']
```

In `frontend/src/room/view.ts`, replace the import and the `ParticipantRow` line with:

```ts
import type { Estimation, RoomSnapshot } from '../protocol/snapshot'

// What the table renders per participant, read off the union in one place.
export type ParticipantRow = {
  id: string
  name: string
  voted: boolean
  hasEstimation: boolean
  estimation: string
}

const confirmed = (e: Estimation) => e.type === 'Confirmed' || e.type === 'ConfirmedHidden'
const shown = (e: Estimation) =>
  e.type === 'Confirmed' || e.type === 'Unconfirmed' ? e.value : ''

const toRow = ({ id, name, estimation }: RoomSnapshot['users'][number]): ParticipantRow => ({
  id,
  name,
  voted: confirmed(estimation),
  hasEstimation: estimation.type !== 'NoEstimation',
  estimation: shown(estimation)
})
```

and in `applySnapshot`, read the rows rather than the wire:

```ts
  const users = s.users.map(toRow)
  const me = users.find(u => u.id === s.you)
```

with `users.forEach(u => {` for the tally and `users,` in the returned object. The rest of the function is unchanged.

Run: `npm run typecheck`
Expected: FAIL in `view.test.ts`, whose fixtures still build the old shape. That is the compiler pointing at every reader of the union.

- [ ] **Step 4: Rewrite the client tests for the union**

`frontend/src/protocol/snapshot.test.ts`, whole file:

```ts
import { describe, expect, it } from 'vitest'
import { snapshotSchema, strictSnapshotSchema } from './snapshot'

const withEstimation = (estimation: object) => ({
  you: 'a',
  currentIssue: '',
  votesRevealed: false,
  users: [{ id: 'a', name: 'A', estimation }]
})
const base = withEstimation({ type: 'NoEstimation' })

describe('the snapshot schemas', () => {
  it('drop an unknown key when lenient and refuse it at any depth when strict', () => {
    const top = { ...base, extra: 1 }
    const nested = { ...base, users: [{ ...base.users[0], extra: 1 }] }
    expect(snapshotSchema.parse(top)).toEqual(base)
    expect(snapshotSchema.parse(nested)).toEqual(base)
    expect(strictSnapshotSchema.safeParse(top).success).toBe(false)
    expect(strictSnapshotSchema.safeParse(nested).success).toBe(false)
    expect(strictSnapshotSchema.safeParse(base).success).toBe(true)
  })

  it('accept each estimation tag with a value exactly where the reader may see one', () => {
    for (const type of ['NoEstimation', 'ConfirmedHidden', 'UnconfirmedHidden'])
      expect(strictSnapshotSchema.safeParse(withEstimation({ type })).success).toBe(true)
    for (const type of ['Confirmed', 'Unconfirmed'])
      expect(strictSnapshotSchema.safeParse(withEstimation({ type, value: '5' })).success).toBe(true)
    expect(snapshotSchema.safeParse(withEstimation({ type: 'Confirmed' })).success).toBe(false)
    expect(snapshotSchema.safeParse(withEstimation({ type: 'Bogus' })).success).toBe(false)
    const leaked = withEstimation({ type: 'ConfirmedHidden', value: '5' })
    expect(strictSnapshotSchema.safeParse(leaked).success).toBe(false)
  })
})
```

`frontend/src/room/view.test.ts`, whole file:

```ts
import { describe, expect, it } from 'vitest'
import type { Estimation, RoomSnapshot } from '../protocol/snapshot'
import { applySnapshot } from './view'

const none: Estimation = { type: 'NoEstimation' }
const confirmed = (value: string): Estimation => ({ type: 'Confirmed', value })
const unconfirmed = (value: string): Estimation => ({ type: 'Unconfirmed', value })

const row = (id: string, estimation: Estimation) => ({ id, name: id.toUpperCase(), estimation })
const snap = (users: RoomSnapshot['users'], extra: Partial<RoomSnapshot> = {}): RoomSnapshot => ({
  you: 'a',
  currentIssue: 'PP-1',
  votesRevealed: false,
  users,
  ...extra
})
const idle = { issueFocused: false, currentIssue: '' }

describe('applySnapshot', () => {
  it('reads each estimation tag into the row the table renders', () => {
    const s = snap([
      row('a', none),
      row('b', { type: 'ConfirmedHidden' }),
      row('c', { type: 'UnconfirmedHidden' }),
      row('d', confirmed('5')),
      row('e', unconfirmed('8'))
    ])
    expect(applySnapshot(idle, s).users.map(u => [u.voted, u.hasEstimation, u.estimation])).toEqual([
      [false, false, ''],
      [true, true, ''],
      [false, true, ''],
      [true, true, '5'],
      [false, true, '8']
    ])
  })

  it('tallies every participant with an estimation, confirmed or not, most votes first', () => {
    const s = snap(
      [row('a', confirmed('5')), row('b', unconfirmed('8')), row('c', confirmed('8')), row('d', none)],
      { votesRevealed: true }
    )
    expect(applySnapshot(idle, s).votesSummary).toEqual([
      ['8', 2],
      ['5', 1]
    ])
  })

  it("keeps the typed issue while the input is focused, and takes the room's otherwise", () => {
    const s = snap([row('a', none)])
    expect(applySnapshot({ issueFocused: true, currentIssue: 'draft' }, s).currentIssue).toBe('draft')
    expect(applySnapshot({ issueFocused: false, currentIssue: 'draft' }, s).currentIssue).toBe('PP-1')
  })

  it("reads the reader's own estimation and whether it is confirmed", () => {
    const own = (e: Estimation) => applySnapshot(idle, snap([row('a', e)]))
    expect(own(confirmed('5'))).toMatchObject({ userEstimation: '5', ownVoteConfirmed: true })
    expect(own(unconfirmed('5'))).toMatchObject({ userEstimation: '5', ownVoteConfirmed: false })
    expect(own(none)).toMatchObject({ userEstimation: '', ownVoteConfirmed: true })
    const absent = applySnapshot(idle, snap([row('b', confirmed('5'))]))
    expect(absent).toMatchObject({ userEstimation: '', ownVoteConfirmed: true })
  })
})
```

In `frontend/src/room/connection.test.ts`, change the `frame`'s participant to `{ id: 'a', name: 'Alice', estimation: { type: 'NoEstimation' } }`. Without that, the schema drops every frame and the store cases fail at runtime rather than at compile time.

- [ ] **Step 5: Run everything**

```bash
npm run typecheck && npm run lint && sbt test && npm run test:unit && npm run e2e
```

Expected: all green. Vitest has 25 cases, eight of them contract states. The e2e suite has 74 runs, the same as Task 4.

- [ ] **Step 6: Commit**

```bash
git add src frontend
git commit -m "feat(protocol): carry the estimation as a tagged union"
```

---

### Task 8: Compare the look, before and after

No commit. The images and the notes go in the PR, as the spec requires.

- [ ] **Step 1: Capture the after set**

```bash
npm run build && npm run stage
mkdir -p <scratchpad>/look-after && cp <scratchpad>/look.mjs . && node look.mjs <scratchpad>/look-after; rm look.mjs
```

- [ ] **Step 2: Compare each pair by eye, and write down every difference**

Open `look-before/N.png` and `look-after/N.png` side by side for each of the three. The expected differences are Lucide's redrawn icons (pencil, lock, circle-check, shield-off) and anything Bootstrap 4.4.1 to 4.6.2 changed. Anything else, such as a spacing change, a colour change or a moved element, is a finding: report it to the user with the pair before opening the PR, and do not fix it silently.

---

### Task 9: Record step 8 in the docs

Same PR, own commit, since the docs describe the code that landed.

**Files:**
- Modify: `README.md`, `docs/known-issues.md`, `docs/roadmap.md`, `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`, `docs/superpowers/specs/2026-09-24-frontend-rewrite-design.md` (status line only), `docs/superpowers/plans/README.md`

- [ ] **Step 1: `README.md`**

- **Tech stack:** replace `* Vue.js` with `* React, TypeScript and Vite, under `frontend/``.
- **Running locally:** before the `SECURE_COOKIES` paragraph, add that the page needs Node, the version in `mise.toml` (`mise install`) or any Node of that major. Then describe the two dev modes. For page work, run `SECURE_COOKIES=false sbt run` and `npm run dev` in two terminals and open Vite's address: it hot-reloads and forwards `/rooms` and `/create-room` to port 8080, SSE included. It does not reproduce the not-a-room page or the UUID redirect, which the e2e suite covers. For backend work, run `npm run build` once and then `sbt run` alone on port 8080. Without a build, `/` answers `503` with "The page is not built: run `npm run build`".
- **Testing:** add `npm run test:unit`, the Vitest suite under `frontend/src`, noting that its contract test reads the snapshots `sbt test` writes to `target/contract/`, so it runs after `sbt test`. Update the pre-hook paragraph: the hooks are now `npm run build && npm run stage`, and invoking `node --test` or `npx playwright test` directly skips both.
- **Deployment:** add that the page is built before sbt by `clevercloud/build-frontend.sh`, which Clever runs as `CC_PRE_BUILD_HOOK`; that `application.conf`'s `index-path` (`frontend/dist/index.html`) is the one setting, and the `/assets/` files beside it are served `immutable` for a year, since each name carries a content hash and the revalidated page names the new files after a deploy.

- [ ] **Step 2: `docs/known-issues.md`**

- Remove the entry "The page and the browser suite depend on three public CDNs at runtime" whole.
- Move the citations of the four entries that point into the deleted `index.html` to the symbols that replace it. Rewrite each entry's **Where** line, and any `index.html:NNN` in its body, as one edit per paragraph:
  - "The issue editor has no cancel, and an unfocused draft is replaced by any room activity": `frontend/src/components/IssueEditor.tsx` (`commit`, and the pencil setting `editing`), `Room.tsx`'s `issueFocused` state, and `applySnapshot`'s `prev.issueFocused ? prev.currentIssue : s.currentIssue` in `frontend/src/room/view.ts`. The spec lists three entries to move, and this is the fourth: the same rule applies, since its target is deleted.
  - "A tied vote is broken by JavaScript key order, not by a rule anyone chose": the `votesSummary` sort in `applySnapshot`, `frontend/src/room/view.ts`, whose comparator is now `(a, b) => b[1] - a[1]`. Correct the quoted code in the Issue paragraph to match.
  - "A Show during a partial re-vote tallies two rounds as one distribution": the tally in `applySnapshot`, `frontend/src/room/view.ts`.
  - "A reveal with votes still pushes the participants list down": `frontend/src/components/Results.tsx` (the summary block, rendered only while revealed with a non-empty tally) above `Participants.tsx`. The frozen-round notice it contrasts with is the hidden row in `Deck.tsx`.
- Leave the historical `index.html` mentions in the stale-citation entry alone. They record what earlier steps did.

- [ ] **Step 3: `docs/roadmap.md`**

In Phase 3, tick "Migrate off Vue 2" and reword it to `Migrate off Vue 2, to React (step 8).`; tick "Component structure, TypeScript, build tooling, automated tests."; leave "Appearance" open, noting `(step 8c)`. In the backlog, change the citation `(`index.html`'s `onmessage`)` to `(`frontend/src/room/connection.ts`'s `onmessage`)`.

- [ ] **Step 4: The parent design's "Landed" paragraph**

In `2026-08-31-protocol-target-architecture-design.md`, add this paragraph after step 8's "It also revisits step 3a's frozen deck" paragraph and before "**Step 9.":

> Landed. Step 8, the technical migration, in seven commits where the frontend spec lists four, each split where its halves are judged by different tests: the server's `/assets/` route and `503`, the Vite toolchain building the old page, the room state in TypeScript, the React components, the typed client, the strict contract test and the estimation union. The page lives in `frontend/`, is built to `frontend/dist/` by `clevercloud/build-frontend.sh` before sbt runs, and is served from there. The endpoint descriptions moved from `API` to `Endpoints`, so `genOpenApi` writes the document from test sources without an actor system. The participant's `voted`, `hasEstimation` and `estimation` are one `estimation` union now, which closes section 2's deferral. The e2e suite passed with no selector change. Steps 8a to 8c extend this paragraph.

- [ ] **Step 5: The frontend spec's status and the plans record**

In `2026-09-24-frontend-rewrite-design.md`, change only the status line to `Status: Step 8 landed; steps 8a to 8c proposed`.

In `docs/superpowers/plans/README.md`, append to "The record so far":

> Step 8 has one. It is the large-surface-area case, with a new toolchain, a second language, ten components and a wire change. What its plan carries beyond decomposition is the dry run: every code block was assembled and run against the unchanged e2e suite before the plan was written, which is what let the plan promise no selector changes. It decomposed into seven production commits where the spec listed four, splitting each commit whose halves were judged by different tests.

- [ ] **Step 6: Check the docs, then commit**

```bash
grep -rn "src/main/resources/pages/index.html" README.md docs/known-issues.md docs/roadmap.md   # expect nothing
grep -n "—" README.md docs/known-issues.md docs/roadmap.md docs/superpowers/plans/README.md docs/superpowers/plans/2026-09-25-protocol-architecture-8-frontend-rewrite.md   # expect nothing new
git add README.md docs
git commit -m "docs: record step 8 as landed"
```

---

## Final verification

- [ ] Run the whole of CI's sequence locally from a clean tree, in CI's order:

```bash
git status --short   # clean
./clevercloud/build-frontend.sh && npm run typecheck && npm run lint
sbt qa && npm run test:unit
sbt genOpenApi && npm run gen:api && git status --porcelain -- frontend/src/protocol/generated   # empty
sbt styleCheck && npm test && npm run e2e
```

- [ ] `git log --oneline main..` shows the spec commits and then the eight commits of Tasks 1 to 7 and 9, each a Conventional Commit with no attribution line.
- [ ] Report to the user with the test counts, the look comparison and the PR description's list of harness changes: the guard replacing the asset cache, the `fixtures.js`, `smoke.spec.js` and `playwright.config.js` comments, the testkit's `INDEX_PATH` and page check, the pre-hooks, and the new `lobby.spec.js`. Say that no selector changed, and list the accepted port differences from the decisions above. Push and open the PR only when the user asks. The rollout (`CC_PRE_BUILD_HOOK`, the merge in GitHub's interface, the stack order) is theirs.
