# Step 8b: Issue Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a draft issue survive blur and room activity: edit mode, not focus, guards it, with a cancel, Enter and Escape, a "Changed by someone else" notice with "Use theirs", and a failure line; and make every `api.ts` request fail once unanswered for 10 s.

**Architecture:** The editor's states x events matrix becomes a pure `step(state, event)` in `frontend/src/room/issueEditor.ts`, with `shows(state)` deriving what renders and `roomIssue(state)` implementing the spec's "room's issue". `useIssueEditor` holds that state in React through `useReducer(step, issue, initial)` and turns the save's promise into `succeeded` or `failed`; `IssueEditor` is markup only. `api.ts` runs each request inside `timed`, which aborts the whole call, body included, at `REQUEST_TIMEOUT_MS`; `connection.ts`'s liveness fetch now shares that constant.

**Tech Stack:** React 19, TypeScript 5.9, Bootstrap 4.6 classes, `lucide-react`, `openapi-fetch` 0.17, Vitest 5 with fake timers (node environment, no DOM), Playwright 1.63 against the testkit stub.

**Spec:** `docs/superpowers/specs/2026-09-24-frontend-rewrite-design.md`: "Issue editor behaviour" (the states table, the matrix, the look, the accepted races and "Why the saved text waits"), "Scope and sequencing" (step 8b and the editor's e2e changes), "Frontend architecture" (`api.ts`'s 10 s bound), "Error handling", "Testing" (the cases naming step 8b), "Docs in the same PR" (step 8b) and "Done when". Step 8c is out of scope.

## How the code in this plan was verified

Every patch below was applied and run in a scratch worktree on 2026-09-30, one commit at a time, on this branch at `5d47c1d`. Review then moved Task 1's bound from `fetch` to the whole call, and review split the editor into its machine and its wiring; all three commits were rerun together on that version:

- **Green at the end.** `npm run typecheck`, `npm run lint`, `npm run test:unit` (78 tests), `node --test "test/**/*.test.js"` (17 tests), and the whole e2e suite, 102 of 102 in Chromium and Firefox. No Scala changes, so `sbt test` was not rerun; Task 4 runs it.
- **Each commit's tests failed first.** Task 1's two bound tests failed with `expected [ 'pending', 'pending' ] to deeply equal [ 'pending', 'AbortError' ]`. Task 2's machine tests failed on the missing module. Against the old editor, with the fixtures pointed back at its class selector so that behaviour and not a missing name decides, six of the new or inverted e2e cases failed on a behaviour assertion; the failures are quoted in Task 3, Step 7.
- **Teeth, by mutation.** Two new e2e cases pass against the old editor too, since it has neither bug: "a save refused by a different instance recovers like any command" failed once `Room`'s save stopped reporting the rejection, and "a double-clicked check posts once" failed with two POSTs once both the disabled check and `submit`'s mode guard were removed. The machine's latch failed "ends on the page's own frame and follows the room after it" once made to recompute from `before` instead of clearing. The IME guard failed "Enter saves and Escape cancels" once removed. "Leaves no timer behind once answered" failed once `clearTimeout` was removed. "Fails once its body stalls for 10 s" was the only failure against a bound on `fetch` alone, the design review replaced, whose promise settles at the headers.
- **One flake found and fixed.** Asserting "Could not save the issue" before a 401's reload failed once in a full run: the liveness fetch can reload within milliseconds, the spec's accepted race "A 401 while the app runs". The case now asserts the reload and the dropped draft only, and passed 10 of 10 repeats; the other editor cases passed 72 of 72 over four repeats each.
- **The look.** A throwaway Playwright screenshot of the notice and the failure line together matched the spec's mockup, centred by the card's `text-center`.
- **Formatting.** Touched files pass `npx prettier --check --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid`, except lines Prettier already flagged before this step in `view.ts` and `view.test.ts`, which this plan leaves alone.

## Decisions this plan takes that the spec does not settle

Each is implemented as written unless review changes it.

- **P1. The matrix is a pure module, `frontend/src/room/issueEditor.ts`, and `useIssueEditor` is 27 lines of wiring.** Vitest runs in node with no DOM renderer, so the spec's unit tests "for `issueEditor.ts`" run against `step` and `shows`, and the e2e cases cover the hook. The module has no React import, so it sits in the room-state layer beside `view.ts`, where the spec's architecture places it.
- **P2. `REQUEST_TIMEOUT_MS` is defined once, in `api.ts`.** `connection.ts`'s `FETCH_TIMEOUT_MS` becomes an alias of it, so the liveness fetch and its tests keep their names. The protocol layer cannot import from the room layer, which settles the direction.
- **P3. The bound wraps the whole call, not the fetch.** Each exported function runs its `client.POST` inside `timed`, passing the signal in the call's options, which `openapi-fetch` puts on the `Request`. A bound on `fetch` alone ends at the headers, and `openapi-fetch` reads the body after that, so a stalled body would hang. That covers every request `api.ts` makes, join and create included, as "Frontend architecture" says. Its test installs a `fetch` mock and a `Request` stub through `vi.hoisted`, since `createClient` captures both at import and node's `Request` refuses the page's relative paths.
- **P4. The pencil and "Use theirs" focus the box,** so Enter and Escape work without a second click. Today's page leaves focus on the pencil, and "Use theirs" unmounts with the notice, which would drop focus to the page.
- **P5. Enter while an input method is composing does nothing,** since it confirms the composition rather than the draft.
- **P6. `Room` derives the view on every render.** With `issueFocused` gone, `applySnapshot` is a pure function of the snapshot, so `Room`'s `seen` and `view` state and their fold go. `View.currentIssue` stays and feeds the editor as the store's issue.
- **P7. `Room`'s save reports its rejection, then rethrows it.** `report` is today's `run` handler: a 401 calls `onRefused` and anything else is logged. The rethrow reaches `useIssueEditor` as `failed`.
- **P8. Three e2e cases beyond the spec's list:** "a double-clicked check posts once", "a save the network drops keeps the draft and says so", and, in `refusal.spec.js`, "a save refused by a different instance recovers like any command". They pin the saving state's disabled check, the failure cell and the 401 cell.
- **P9. The spec's count of `issueButton`'s call sites is corrected from nine to twelve** in the commit that adds this plan: three outside the editor cases (the read-only case and `departureWhileCut`) and nine inside them.
- **P10. Three commits.** The 10 s bound is judged by its own unit test and has an effect beyond the editor, so it lands first. The editor's machine is judged by its unit cases alone and holds the matrix's hard logic, so it lands second, before anything imports it. The wiring commit carries the docs: the known-issues entry removed, the spec's status line and the parent design's "Landed" paragraph.

## Global Constraints

- No em dash anywhere, in code, comments, docs or commit messages.
- Code comments are one or two lines, never more.
- Conventional Commits, and no generated-with or co-authored-by attribution line.
- TypeScript and JavaScript: single quotes, no semicolons, print width 100, no trailing commas, `arrow-parens avoid`; lines at most 100 columns.
- The look stays Bootstrap 4 classes the page already uses, with no new CSS (spec, "Issue editor behaviour").
- Neither the notice nor the failure line carries an ARIA role; live regions wait for step 8c.
- `REQUEST_TIMEOUT_MS = 10_000`, the liveness fetch's bound.
- Copy, verbatim: accessible names "Edit issue", "Save issue", "Cancel editing"; `Changed by someone else to: "X"`; "Use theirs"; "Could not save the issue"; the placeholder stays "Current issue".
- The e2e suite must never contact a host other than `127.0.0.1`.
- The unit counts assume `target/contract/` exists from an earlier `sbt test`; without it `snapshot.contract.test.ts` fails with "run sbt test first".
- Every commit brings a test shown failing against the commit before it.
- Do not push or merge: 8a and 8b merge together in a window with no live rooms (spec, "Rollout").

## Review Focus

The inputs most likely to bite a person that the spec leaves unsaid, most likely first. Each has its test in Task 2 or Task 3.

1. **Enter pressed to confirm an input method's composition** (Japanese, Chinese, Korean). Expected: the composition confirms and nothing is saved. Pinned in "Enter saves and Escape cancels" with a composing `keydown`.
2. **A double-clicked check, or Enter held down.** Expected: one POST. Pinned by "a double-clicked check posts once".
3. **Someone empties the issue while you edit.** Expected: the notice reads `Changed by someone else to: ""`, not a line ending at the colon. Pinned by the unit case "names an issue someone emptied".
4. **Safari on macOS, where clicking a button moves no focus.** Expected: the save still posts and the room still resyncs. Pinned by the kept case "a commit that never blurred the box still lets the room resync it".
5. **A phone's on-screen keyboard.** Expected: its Enter or Go key saves. The e2e suite runs no phone, so the rollout's hand test on the Android phone ("Step 8b: edit the issue, save and cancel") covers it; Task 4 lists it in the hand-over.

---

### Task 1: `api.ts` aborts a request unanswered after 10 s

**Files:**
- Modify: `frontend/src/protocol/api.ts` (below `const client`, and the five exported functions)
- Modify: `frontend/src/room/connection.ts` (the `api` import and `FETCH_TIMEOUT_MS`)
- Test: `frontend/src/protocol/api.test.ts`

**Interfaces:**
- Produces: `export const REQUEST_TIMEOUT_MS = 10_000` in `api.ts`. Every exported `api.ts` function (`createRoom`, `join`, `command`, `vote`, `editIssue`) now rejects with an `AbortError` `DOMException` once its request, body included, has gone unfinished for `REQUEST_TIMEOUT_MS`.

- [ ] **Step 1: Write the failing tests**

Replace `frontend/src/protocol/api.test.ts` with:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, editIssue, isSessionRefusal, REQUEST_TIMEOUT_MS } from './api'

// Installed before the import, since createClient captures fetch and Request once.
const fetchMock = vi.hoisted(() => {
  // Node's Request refuses the page's relative paths, so resolve them against a stand-in origin.
  const Native = globalThis.Request
  globalThis.Request = class extends Native {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(typeof input === 'string' ? new URL(input, 'http://page.test') : input, init)
    }
  }
  const mock = vi.fn<(request: Request, init?: RequestInit) => Promise<Response>>()
  vi.stubGlobal('fetch', mock)
  return mock
})

// Rejects once the request aborts, as fetch does for a request or a body in flight.
const onAbort = (signal: AbortSignal, reject: (reason: unknown) => void) =>
  signal.addEventListener('abort', () => reject(signal.reason))

// Never answers, as a hung proxy does.
const hung = (request: Request, init?: RequestInit) =>
  new Promise<Response>((_, reject) => onAbort(init?.signal ?? request.signal, reject))

// Answers a 401's headers, then never finishes its body.
const stalled = async (request: Request, init?: RequestInit) => {
  const signal = init?.signal ?? request.signal
  const body = new ReadableStream({ start: stream => onAbort(signal, e => stream.error(e)) })
  return new Response(body, { status: 401 })
}

// How a save stands 1 ms before the bound and at it.
async function outcome() {
  const settled = editIssue('brave-golden-otter', 'PP-1').then(
    () => 'resolved',
    (reason: unknown) => (reason instanceof DOMException ? reason.name : 'other')
  )
  const now = () => Promise.race([settled, Promise.resolve('pending')])
  await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1)
  const early = await now()
  await vi.advanceTimersByTimeAsync(1)
  return [early, await now()]
}

afterEach(() => {
  vi.useRealTimers()
  fetchMock.mockReset()
})

describe('isSessionRefusal', () => {
  it('holds for a 401 only', () => {
    expect(isSessionRefusal(new ApiError('vote', 401))).toBe(true)
    expect(isSessionRefusal(new ApiError('vote', 403))).toBe(false)
    expect(isSessionRefusal(new ApiError('vote', 409))).toBe(false)
    expect(isSessionRefusal(new Error('vote answered 401'))).toBe(false)
    expect(isSessionRefusal(new TypeError('Failed to fetch'))).toBe(false)
  })
})

describe('a request', () => {
  it('fails once unanswered for 10 s', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(hung)
    expect(await outcome()).toEqual(['pending', 'AbortError'])
  })

  it('fails once its body stalls for 10 s', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(stalled)
    expect(await outcome()).toEqual(['pending', 'AbortError'])
  })

  it('leaves no timer behind once answered', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }))
    await editIssue('brave-golden-otter', 'PP-1')
    expect(vi.getTimerCount()).toBe(0)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --root frontend src/protocol/api.test.ts`
Expected: FAIL. "fails once unanswered for 10 s" and "fails once its body stalls for 10 s", each with `expected [ 'pending', 'pending' ] to deeply equal [ 'pending', 'AbortError' ]`. "leaves no timer behind once answered" passes, since no timer exists yet; Step 5 shows its teeth. `page.test` is a reserved name and the mock answers every call, so no connection is made.

- [ ] **Step 3: Bound every call**

In `frontend/src/protocol/api.ts`, after `const client = createClient<paths>()` and its blank line, insert:

```ts
// The liveness fetch's bound too, so a request hung on a dead network fails rather than waits.
export const REQUEST_TIMEOUT_MS = 10_000

// Bounds the whole call, body included, since fetch itself settles once the headers arrive.
async function timed<T>(call: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await call(controller.signal)
  } finally {
    clearTimeout(timeout)
  }
}
```

and route each of the five `client.POST` calls through it, passing `signal` in its options:

```ts
export async function createRoom(): Promise<string> {
  const { data, response } = await timed(signal =>
    client.POST('/create-room', { parseAs: 'text', signal })
  )
  if (data === undefined) throw refused('create-room', response)
  return data
}

export async function join(roomId: string, name: string): Promise<JoinOutcome> {
  const { response } = await timed(signal =>
    client.POST('/rooms/{roomId}/join', { params: { path: { roomId } }, body: { name }, signal })
  )
  // The page route has already judged the path, so a 404 here is a room refused after load.
  if (response.status === 404) return 'not-a-room'
  if (!response.ok) throw refused('join', response)
  return 'joined'
}

export type Command = 'show' | 'clear' | 'revote'

export async function command(roomId: string, name: Command): Promise<void> {
  const path = `/rooms/{roomId}/${name}` as const
  const { response } = await timed(signal =>
    client.POST(path, { params: { path: { roomId } }, signal })
  )
  if (!response.ok) throw refused(name, response)
}

export async function vote(roomId: string, estimation: string): Promise<void> {
  const { response } = await timed(signal =>
    client.POST('/rooms/{roomId}/vote', {
      params: { path: { roomId } },
      body: { estimation },
      signal
    })
  )
  if (!response.ok) throw refused('vote', response)
}

export async function editIssue(roomId: string, issue: string): Promise<void> {
  const { response } = await timed(signal =>
    client.POST('/rooms/{roomId}/edit-issue', {
      params: { path: { roomId } },
      body: { issue },
      signal
    })
  )
  if (!response.ok) throw refused('edit-issue', response)
}
```

In `frontend/src/room/connection.ts`, change the first line to:

```ts
import { REQUEST_TIMEOUT_MS, type JoinOutcome } from '../protocol/api'
```

and `export const FETCH_TIMEOUT_MS = 10_000` to:

```ts
export const FETCH_TIMEOUT_MS = REQUEST_TIMEOUT_MS
```

keeping its comment above it unchanged.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm run test:unit`
Expected: 55 tests pass. `connection.test.ts` still imports `FETCH_TIMEOUT_MS` and is unchanged.

- [ ] **Step 5: Show the cleanup test has teeth**

Temporarily delete the `clearTimeout(timeout)` line in `timed`.
Run: `npx vitest run --root frontend src/protocol/api.test.ts`
Expected: FAIL, "leaves no timer behind once answered" with `expected 1 to be +0`.
Then put the line back.

- [ ] **Step 6: Typecheck, lint, format**

Run: `npm run typecheck && npm run lint && npx prettier --check --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid frontend/src/protocol/api.ts frontend/src/protocol/api.test.ts frontend/src/room/connection.ts`
Expected: no errors; `All matched files use Prettier code style!`

- [ ] **Step 7: Commit**

```bash
git add frontend/src/protocol/api.ts frontend/src/protocol/api.test.ts frontend/src/room/connection.ts
git commit -m "feat(frontend): abort a request unanswered after 10 s (step 8b)" -m "api.ts runs every request inside timed, which aborts the whole call, body included, at REQUEST_TIMEOUT_MS, the liveness fetch's bound, which connection.ts now reads from it. The bound covers the body because openapi-fetch reads it after fetch settles at the headers. A command, a join or a create hung on a dead network or a proxy now rejects with an AbortError instead of waiting forever, and each caller's existing failure path handles it."
```

---

### Task 2: The editor's matrix as a pure state machine

**Files:**
- Create: `frontend/src/room/issueEditor.ts`, `frontend/src/room/issueEditor.test.ts`

**Interfaces:**
- Produces: `frontend/src/room/issueEditor.ts`: `type Mode = 'viewing' | 'editing' | 'saving'`; `type EditorState`; `type EditorEvent`; `initial(issue: string): EditorState`; `step(s: EditorState, e: EditorEvent): EditorState`; `type EditorView = { mode: Mode; text: string; notice: string | null; failed: boolean }`; `shows(s: EditorState): EditorView`. Nothing imports it until Task 3.

How the matrix maps onto `step`: the events are `pencil`, `typed`, `save` (Enter or the check), `cancel` (Escape or the cancel), `theirs`, `snapshot`, `succeeded` and `failed` (any rejection, a 401 or an abort included). An event outside the state that handles it returns the state unchanged, which is both the matrix's "Ignored" and its "Cannot happen". The spec's "room's issue" is `roomIssue`: `saved`, the saved text, while non-null, else `store`. `saved` is set on `succeeded` only if the store still holds `before`, its value when saving began, and cleared by the first `snapshot` whose issue differs from `before`, so it never comes back.

- [ ] **Step 1: Write the machine's failing tests**

Create `frontend/src/room/issueEditor.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { initial, shows, step, type EditorEvent } from './issueEditor'

const pencil: EditorEvent = { type: 'pencil' }
const save: EditorEvent = { type: 'save' }
const cancel: EditorEvent = { type: 'cancel' }
const theirs: EditorEvent = { type: 'theirs' }
const succeeded: EditorEvent = { type: 'succeeded' }
const failed: EditorEvent = { type: 'failed' }
const typed = (text: string): EditorEvent => ({ type: 'typed', text })
const frame = (issue: string): EditorEvent => ({ type: 'snapshot', issue })

// Each case starts in a room whose issue is PP-1.
const after = (...events: EditorEvent[]) => shows(events.reduce(step, initial('PP-1')))
const viewing = (text: string) => ({ mode: 'viewing', text, notice: null, failed: false })
const editing = (text: string, notice: string | null = null, isFailed = false) => ({
  mode: 'editing',
  text,
  notice,
  failed: isFailed
})
const saving = (text: string) => ({ mode: 'saving', text, notice: null, failed: false })
const editingMine = [pencil, typed('mine')]
const savingMine = [...editingMine, save]

describe('the editor while viewing', () => {
  it("shows the room's issue, and follows it", () => {
    expect(after()).toEqual(viewing('PP-1'))
    expect(after(frame('PP-1'))).toEqual(viewing('PP-1'))
    expect(after(frame('PP-2'))).toEqual(viewing('PP-2'))
  })

  it("opens on the pencil with the room's issue as draft and starting point", () => {
    expect(after(frame('PP-2'), pencil)).toEqual(editing('PP-2'))
  })

  it('ignores Enter, the check, Escape and the cancel', () => {
    expect(after(save)).toEqual(viewing('PP-1'))
    expect(after(cancel)).toEqual(viewing('PP-1'))
  })
})

describe('the editor while editing', () => {
  it('updates the draft on typing', () => {
    expect(after(...editingMine)).toEqual(editing('mine'))
  })

  it('saves on Enter or the check', () => {
    expect(after(...savingMine)).toEqual(saving('mine'))
  })

  it("drops the draft on Escape or the cancel and shows the room's issue", () => {
    expect(after(...editingMine, cancel)).toEqual(viewing('PP-1'))
    expect(after(...editingMine, frame('PP-2'), cancel)).toEqual(viewing('PP-2'))
  })

  it('keeps the draft through a snapshot with the issue unchanged', () => {
    expect(after(...editingMine, frame('PP-1'))).toEqual(editing('mine'))
  })

  it("keeps the draft through a changed issue, with the notice naming the room's issue", () => {
    expect(after(...editingMine, frame('PP-2'))).toEqual(editing('mine', 'PP-2'))
  })

  it('names an issue someone emptied, which the notice shows as ""', () => {
    expect(after(...editingMine, frame(''))).toEqual(editing('mine', ''))
  })

  it("shows no notice while the room's issue matches the starting point or the draft", () => {
    expect(after(...editingMine, frame('PP-2'), frame('PP-1'))).toEqual(editing('mine'))
    expect(after(...editingMine, frame('mine'))).toEqual(editing('mine'))
    // An untouched draft is the starting point, so any change is someone else's.
    expect(after(pencil, frame('PP-2'))).toEqual(editing('PP-1', 'PP-2'))
  })

  it("takes the room's issue as draft and starting point on Use theirs", () => {
    expect(after(...editingMine, frame('PP-2'), theirs)).toEqual(editing('PP-2'))
    // Typing again and a later change raise the notice against the new starting point.
    expect(after(...editingMine, frame('PP-2'), theirs, typed('x'), frame('PP-3'))).toEqual(
      editing('x', 'PP-3')
    )
  })
})

describe('the editor while saving', () => {
  it('ignores Enter, the check, Escape, the cancel and typing', () => {
    expect(after(...savingMine, save)).toEqual(saving('mine'))
    expect(after(...savingMine, cancel)).toEqual(saving('mine'))
    expect(after(...savingMine, typed('other'))).toEqual(saving('mine'))
  })

  it('shows nothing of a snapshot, and the next state reads the store', () => {
    expect(after(...savingMine, frame('PP-2'))).toEqual(saving('mine'))
    expect(after(...savingMine, frame('PP-2'), failed)).toEqual(editing('mine', 'PP-2', true))
  })

  it('goes back to viewing on success, showing the saved text', () => {
    expect(after(...savingMine, succeeded)).toEqual(viewing('mine'))
  })

  it('goes back to editing on a failure, a 401 or an abort alike, with the draft kept', () => {
    expect(after(...savingMine, failed)).toEqual(editing('mine', null, true))
  })
})

describe('a failed save', () => {
  it('says so until the editor leaves editing', () => {
    const failedMine = [...savingMine, failed]
    expect(after(...failedMine, typed('mine2'))).toEqual(editing('mine2', null, true))
    expect(after(...failedMine, frame('PP-2'), theirs)).toEqual(editing('PP-2', null, true))
    expect(after(...failedMine, save)).toEqual(saving('mine'))
    expect(after(...failedMine, cancel, pencil)).toEqual(editing('PP-1'))
  })
})

describe('the saved text', () => {
  it('ignores a stale frame, which carries the issue as it was when saving began', () => {
    expect(after(...savingMine, succeeded, frame('PP-1'))).toEqual(viewing('mine'))
  })

  it("ends on the page's own frame and follows the room after it", () => {
    expect(after(...savingMine, succeeded, frame('mine'), frame('PP-1'))).toEqual(viewing('PP-1'))
  })

  it('ends at once on a frame that beat the POST response', () => {
    expect(after(...savingMine, frame('mine'), succeeded)).toEqual(viewing('mine'))
    expect(after(...savingMine, frame('mine'), succeeded, frame('PP-1'))).toEqual(viewing('PP-1'))
  })

  it("ends on someone else's later edit", () => {
    expect(after(...savingMine, succeeded, frame('PP-9'))).toEqual(viewing('PP-9'))
  })

  it('is what the pencil opens, with no notice once the own frame lands', () => {
    expect(after(...savingMine, succeeded, pencil)).toEqual(editing('mine'))
    expect(after(...savingMine, succeeded, pencil, frame('mine'))).toEqual(editing('mine'))
  })
})

describe('the accepted races', () => {
  it('a 10 s abort after the room applied the save: its frame raises no notice', () => {
    expect(after(...savingMine, failed, frame('mine'))).toEqual(editing('mine', null, true))
    expect(after(...savingMine, failed, frame('mine'), save, succeeded)).toEqual(viewing('mine'))
  })

  it("an earlier edit's late frame shows briefly before this one replaces it", () => {
    expect(after(...savingMine, succeeded, frame('PP-2'))).toEqual(viewing('PP-2'))
    expect(after(...savingMine, succeeded, frame('PP-2'), frame('mine'))).toEqual(viewing('mine'))
  })

  it('a page whose own frame never arrives keeps its text until the issue next changes', () => {
    // Restoring exactly PP-1 changes nothing this page can see, since its store still holds it.
    expect(after(...savingMine, succeeded, frame('PP-1'))).toEqual(viewing('mine'))
    // Its own frame and a restore of PP-1 that both beat the response leave the store as it was.
    expect(after(...savingMine, frame('mine'), frame('PP-1'), succeeded)).toEqual(viewing('mine'))
    expect(after(...savingMine, succeeded, frame('PP-3'))).toEqual(viewing('PP-3'))
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --root frontend src/room/issueEditor.test.ts`
Expected: FAIL, `Error: Cannot find module './issueEditor'`.

- [ ] **Step 3: Write the machine**

Create `frontend/src/room/issueEditor.ts`:

```ts
// The issue editor's states and events, the spec's matrix; useIssueEditor wires it to React.
export type Mode = 'viewing' | 'editing' | 'saving'

export type EditorState = {
  mode: Mode
  // The store's issue, as the last snapshot carried it.
  store: string
  draft: string
  start: string
  failed: boolean
  // The store's issue when saving began, which the saved text waits for the store to leave.
  before: string
  saved: string | null
}

export type EditorEvent =
  | { type: 'pencil' }
  | { type: 'typed'; text: string }
  | { type: 'save' }
  | { type: 'cancel' }
  | { type: 'theirs' }
  | { type: 'snapshot'; issue: string }
  | { type: 'succeeded' }
  | { type: 'failed' }

export const initial = (issue: string): EditorState => ({
  mode: 'viewing',
  store: issue,
  draft: '',
  start: '',
  failed: false,
  before: issue,
  saved: null
})

// The spec's "room's issue": the store's, or the saved text while it waits.
const roomIssue = (s: EditorState) => s.saved ?? s.store

// Every event outside its state is ignored, which covers the matrix's "Cannot happen" cells too.
export function step(s: EditorState, e: EditorEvent): EditorState {
  switch (e.type) {
    case 'snapshot':
      return { ...s, store: e.issue, saved: e.issue === s.before ? s.saved : null }
    case 'pencil':
      if (s.mode !== 'viewing') return s
      return { ...s, mode: 'editing', draft: roomIssue(s), start: roomIssue(s), failed: false }
    case 'typed':
      return s.mode === 'editing' ? { ...s, draft: e.text } : s
    case 'save':
      return s.mode === 'editing' ? { ...s, mode: 'saving', failed: false, before: s.store } : s
    case 'cancel':
      return s.mode === 'editing' ? { ...s, mode: 'viewing', draft: '', failed: false } : s
    case 'theirs':
      return s.mode === 'editing' ? { ...s, draft: roomIssue(s), start: roomIssue(s) } : s
    case 'succeeded':
      if (s.mode !== 'saving') return s
      // A frame that beat the response has already moved the store, so nothing is left to wait for.
      return { ...s, mode: 'viewing', saved: s.store === s.before ? s.draft : null, draft: '' }
    case 'failed':
      return s.mode === 'saving' ? { ...s, mode: 'editing', failed: true } : s
  }
}

export type EditorView = { mode: Mode; text: string; notice: string | null; failed: boolean }

export function shows(s: EditorState): EditorView {
  const room = roomIssue(s)
  if (s.mode === 'viewing') return { mode: s.mode, text: room, notice: null, failed: false }
  const conflict = s.mode === 'editing' && room !== s.start && room !== s.draft
  return { mode: s.mode, text: s.draft, notice: conflict ? room : null, failed: s.failed }
}
```

- [ ] **Step 4: Run the machine's tests to see them pass**

Run: `npx vitest run --root frontend src/room/issueEditor.test.ts`
Expected: 24 tests pass.

- [ ] **Step 5: Show the latch has teeth**

Temporarily make the saved text recompute instead of latching: in `step`'s `snapshot` case, change `saved: e.issue === s.before ? s.saved : null` to `saved: s.saved`, and change `roomIssue` to `(s: EditorState) => (s.saved !== null && s.store === s.before ? s.saved : s.store)`.
Run: `npx vitest run --root frontend src/room/issueEditor.test.ts`
Expected: FAIL, exactly "the saved text > ends on the page's own frame and follows the room after it": a room that moves on and then back to the old issue would show the saved text again.
Then undo both edits.

- [ ] **Step 6: Typecheck, lint, format**

Run: `npm run typecheck && npm run lint && npm run test:unit && npx prettier --check --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid frontend/src/room/issueEditor.ts frontend/src/room/issueEditor.test.ts`
Expected: no errors; 79 tests pass (55, plus the machine's 24); `All matched files use Prettier code style!`

- [ ] **Step 7: Commit**

```bash
git add frontend/src/room/issueEditor.ts frontend/src/room/issueEditor.test.ts
git commit -m "feat(frontend): add the issue editor's matrix as a pure state machine (step 8b)" -m "room/issueEditor.ts holds the spec's states x events matrix as step(), with shows() deriving what renders and roomIssue() the room's issue, the saved text while it waits for the store to leave its value from when saving began. Nothing imports it yet; the next commit wires it into the editor."
```

---

### Task 3: Edit mode guards the draft, with a cancel and a conflict notice

**Files:**
- Create: `frontend/src/components/useIssueEditor.ts`
- Modify: `frontend/src/components/IssueEditor.tsx` (whole file), `frontend/src/components/Room.tsx`, `frontend/src/room/view.ts`, `frontend/src/room/view.test.ts`
- Modify: `e2e/fixtures.js` (`issueButton` and the comment above `nameInput`), `e2e/room.spec.js` (the import list, three call sites, and the block from "the issue box resyncs once the editor loses focus" up to "a re-vote leaves the caster shown as selected but unconfirmed"), `e2e/refusal.spec.js` (the import list and one new case at the end)
- Modify: `docs/known-issues.md`, `docs/superpowers/specs/2026-09-24-frontend-rewrite-design.md` (status line), `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md` (step 8's "Landed" paragraph)

**Interfaces:**
- Consumes: Task 2's `initial`, `step` and `shows`; `api.editIssue(roomId: string, issue: string): Promise<void>` and `api.isSessionRefusal(reason: unknown): boolean` from `frontend/src/protocol/api.ts`.
- Produces:
  - `frontend/src/components/useIssueEditor.ts`: `useIssueEditor(issue: string, save: (issue: string) => Promise<void>)` returning `EditorView & { pencil(): void; type(text: string): void; submit(): void; cancel(): void; takeTheirs(): void }`.
  - `IssueEditor` props become `{ issue: string; onSave: (issue: string) => Promise<void> }`.
  - `applySnapshot(s: RoomSnapshot): View`, with `Previous` deleted.
  - `e2e/fixtures.js`: `issuePencil`, `issueCheck`, `issueCancel` replace `issueButton`.

- [ ] **Step 1: Make `applySnapshot` a pure function of the snapshot**

In `frontend/src/room/view.ts`, delete the two lines

```ts
// prev carries only what the next view depends on; step 8b removes issueFocused.
export type Previous = { issueFocused: boolean; currentIssue: string }
```

and the blank line after them, change the signature to `export function applySnapshot(s: RoomSnapshot): View {`, and replace

```ts
    // Do not clobber the issue input while the user is typing in it.
    currentIssue: prev.issueFocused ? prev.currentIssue : s.currentIssue,
```

with

```ts
    currentIssue: s.currentIssue,
```

In `frontend/src/room/view.test.ts`, delete `const idle = { issueFocused: false, currentIssue: '' }` and the blank line after it, replace every `applySnapshot(idle, ` with `applySnapshot(`, and delete the whole case `it("keeps the typed issue while the input is focused, and takes the room's otherwise", ...)`, whose behaviour the machine now owns.

- [ ] **Step 2: Write the hook**

Create `frontend/src/components/useIssueEditor.ts`:

```ts
import { useReducer } from 'react'
import { initial, shows, step } from '../room/issueEditor'

// The editor's state machine held in React; the save's promise answers it with success or failure.
export function useIssueEditor(issue: string, save: (issue: string) => Promise<void>) {
  const [state, dispatch] = useReducer(step, issue, initial)
  // Folded in during render rather than in an effect, so no frame shows the old issue.
  if (issue !== state.store) dispatch({ type: 'snapshot', issue })

  const submit = () => {
    if (state.mode !== 'editing') return
    dispatch({ type: 'save' })
    save(state.draft).then(
      () => dispatch({ type: 'succeeded' }),
      () => dispatch({ type: 'failed' })
    )
  }

  return {
    ...shows(state),
    pencil: () => dispatch({ type: 'pencil' }),
    type: (text: string) => dispatch({ type: 'typed', text }),
    submit,
    cancel: () => dispatch({ type: 'cancel' }),
    takeTheirs: () => dispatch({ type: 'theirs' })
  }
}
```

- [ ] **Step 3: Write the markup**

Replace `frontend/src/components/IssueEditor.tsx` with:

```tsx
import { useRef } from 'react'
import { Check, Pen, X } from 'lucide-react'
import { useIssueEditor } from './useIssueEditor'

type Props = {
  issue: string
  onSave: (issue: string) => Promise<void>
}

export function IssueEditor({ issue, onSave }: Props) {
  const editor = useIssueEditor(issue, onSave)
  const box = useRef<HTMLInputElement>(null)
  const editing = editor.mode === 'editing'
  const open = () => {
    editor.pencil()
    // The same input turns editable, so focusing it now lets Enter and Escape work at once.
    box.current?.focus()
  }
  const takeTheirs = () => {
    editor.takeTheirs()
    // The link-button unmounts with the notice, which would drop focus to the page.
    box.current?.focus()
  }
  return (
    <div className="form-group row">
      <div className="col">
        <div className="input-group">
          <input
            ref={box}
            type="text"
            placeholder="Current issue"
            className="form-control"
            value={editor.text}
            readOnly={!editing}
            onChange={e => editor.type(e.target.value)}
            onKeyDown={e => {
              // Enter also confirms an input method's composition, which is not a save.
              if (e.nativeEvent.isComposing) return
              if (e.key === 'Enter') editor.submit()
              else if (e.key === 'Escape') editor.cancel()
            }}
          />
          <div className="input-group-append">
            {editor.mode === 'viewing' ? (
              <button
                className="btn btn-outline-secondary"
                type="button"
                aria-label="Edit issue"
                onClick={open}
              >
                <Pen size={20} />
              </button>
            ) : (
              <>
                <button
                  className="btn btn-outline-secondary"
                  type="button"
                  aria-label="Save issue"
                  disabled={!editing}
                  onClick={editor.submit}
                >
                  <Check size={20} />
                </button>
                <button
                  className="btn btn-outline-secondary"
                  type="button"
                  aria-label="Cancel editing"
                  disabled={!editing}
                  onClick={editor.cancel}
                >
                  <X size={20} />
                </button>
              </>
            )}
          </div>
        </div>
        {editor.notice !== null && (
          <small className="form-text text-muted">
            Changed by someone else to: "{editor.notice}"{' '}
            <button type="button" className="btn btn-link btn-sm p-0" onClick={takeTheirs}>
              Use theirs
            </button>
          </small>
        )}
        {editor.failed && <small className="form-text text-danger">Could not save the issue</small>}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire it into `Room`**

Replace `frontend/src/components/Room.tsx` with:

```tsx
import * as api from '../protocol/api'
import type { RoomSnapshot } from '../protocol/snapshot'
import { applySnapshot } from '../room/view'
import { Controls } from './Controls'
import { Deck } from './Deck'
import { IssueEditor } from './IssueEditor'
import { Participants } from './Participants'
import { Results } from './Results'
import { RoomHeader } from './RoomHeader'

type Props = {
  roomId: string
  snapshot: RoomSnapshot
  onCopied: () => void
  onLeave: () => void
  onRefused: () => void
}

const log = (reason: unknown) => console.log(reason)

export function Room({ roomId, snapshot, onCopied, onLeave, onRefused }: Props) {
  const view = applySnapshot(snapshot)

  const report = (reason: unknown) => (api.isSessionRefusal(reason) ? onRefused() : log(reason))
  const run = (promise: Promise<void>) => promise.catch(report)
  // The editor shows its own failure, so the rejection goes back to it once reported.
  const saveIssue = (issue: string) =>
    api.editIssue(roomId, issue).catch((reason: unknown) => {
      report(reason)
      throw reason
    })

  const vote = (estimation: string) => {
    // The server refuses it anyway; this only spares the doomed POST.
    if (view.votesRevealed) return
    run(api.vote(roomId, estimation))
  }

  return (
    <div className="row">
      <div className="col-md-8 offset-md-2">
        <div className="card text-center shadow-sm m-1">
          <RoomHeader roomId={roomId} onCopied={onCopied} onLeave={onLeave} />
          <div className="card-body">
            <IssueEditor issue={view.currentIssue} onSave={saveIssue} />
            <Deck view={view} onVote={vote} />
            <Controls
              revealed={view.votesRevealed}
              onShow={() => run(api.command(roomId, 'show'))}
              onRevote={() => run(api.command(roomId, 'revote'))}
              onClear={() => run(api.command(roomId, 'clear'))}
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

- [ ] **Step 5: Run the unit checks**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: no errors; 78 tests pass (79, less the removed `view.test.ts` case).

- [ ] **Step 6: The e2e changes**

In `e2e/fixtures.js`, change the comment above `nameInput` to:

```js
// Step 8 revisits selectors, so these are as accessible as the page allows. The name inputs
// have no label association and no accessible name at all.
```

and replace `export const issueButton = page => page.locator('.input-group-append button')` with:

```js
export const issuePencil = page => page.getByRole('button', { name: 'Edit issue' })
export const issueCheck = page => page.getByRole('button', { name: 'Save issue' })
export const issueCancel = page => page.getByRole('button', { name: 'Cancel editing' })
```

In `e2e/room.spec.js`:

1. In the import list, replace `issueButton,` with `issueCancel,`, `issueCheck,` and `issuePencil,`, one per line.
2. In "the issue box is readonly until the pencil is pressed", `issueButton(alice.page).click()` becomes `issuePencil(alice.page).click()`.
3. In `departureWhileCut`'s loop, the first `issueButton(alice.page).click()` becomes `issuePencil(...)` and the second, after the `fill`, `issueCheck(...)`.
4. Replace everything from `test('the issue box resyncs once the editor loses focus'` up to, not including, `test('a re-vote leaves the caster shown as selected but unconfirmed'` with the block below. It inverts the resync case in place, refreshes the comments of the two kept commit cases so they no longer argue from the focus guard, moves their nine `issueButton` calls onto the new locators, and adds the new cases.

```js
test('a draft survives blur and room activity', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await issuePencil(alice.page).click()
  await issueBox(alice.page).fill('Alice is still typing')

  // Any publish carries the issue, so a vote by anyone would clobber an unguarded box.
  await vote(bob.page, '5')
  // Require the snapshot to have landed: toHaveValue passes on its first poll otherwise.
  await expect(votedMark(participantRow(alice.page, 'Bob'))).toHaveCount(1)
  await expect(issueBox(alice.page)).toHaveValue('Alice is still typing')

  // Edit mode, not focus, guards the draft, so alt-tabbing away to copy a title loses nothing.
  await issueBox(alice.page).blur()
  await bob.page.getByRole('button', { name: 'Clear votes' }).click()
  await expect(votedMark(participantRow(alice.page, 'Bob'))).toHaveCount(0)
  await expect(issueBox(alice.page)).toHaveValue('Alice is still typing')
})

test('an edit committed with the check button reaches the other browser', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await issuePencil(alice.page).click()
  await issueBox(alice.page).fill('PP-42')
  await issueCheck(alice.page).click()

  await expect(issueBox(bob.page)).toHaveValue('PP-42')
  await expect(issueBox(alice.page)).toHaveValue('PP-42')

  // Alice's own saved text cannot distinguish an applied snapshot from a blocked one, so
  // move the room past it and require her to follow.
  await issuePencil(bob.page).click()
  await issueBox(bob.page).fill('PP-43')
  await issueCheck(bob.page).click()
  await expect(issueBox(alice.page)).toHaveValue('PP-43')
})

test('a commit that never blurred the box still lets the room resync it', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await issuePencil(alice.page).click()
  await issueBox(alice.page).fill('PP-42')
  // Stands in for macOS, where clicking a button moves no focus: dispatchEvent carries no
  // mousedown, so the box keeps focus through the save, which must not hold the room off.
  await issueCheck(alice.page).dispatchEvent('click')
  // Proves the commit posted, so a failure below is the editor and not a dead synthetic click.
  await expect(issueBox(bob.page)).toHaveValue('PP-42')

  await issuePencil(bob.page).click()
  await issueBox(bob.page).fill('PP-43')
  await issueCheck(bob.page).click()
  await expect(issueBox(alice.page)).toHaveValue('PP-43')
})

// Sets the room's issue from one browser; the caller waits for whatever proves it landed.
async function setIssue(member, issue) {
  await issuePencil(member.page).click()
  await issueBox(member.page).fill(issue)
  await issueCheck(member.page).click()
}

const conflictNotice = page => page.getByText('Changed by someone else to:')

test('Enter saves and Escape cancels', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await issuePencil(alice.page).click()
  // The pencil focuses the box, so the keys work without clicking into it first.
  await alice.page.keyboard.type('PP-7')
  // An input method's Enter confirms its composition and must not save the draft.
  await issueBox(alice.page).dispatchEvent('keydown', { key: 'Enter', isComposing: true })
  await expect(issueBox(alice.page)).toHaveJSProperty('readOnly', false)
  await alice.page.keyboard.press('Enter')
  await expect(issueBox(bob.page)).toHaveValue('PP-7')
  await expect(issueBox(alice.page)).toHaveJSProperty('readOnly', true)

  await issuePencil(alice.page).click()
  await issueBox(alice.page).fill('scrapped')
  await alice.page.keyboard.press('Escape')
  await expect(issueBox(alice.page)).toHaveJSProperty('readOnly', true)
  await expect(issueBox(alice.page)).toHaveValue('PP-7')
})

test("cancel drops the draft for the room's issue", async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  await setIssue(bob, 'PP-1')
  await expect(issueBox(alice.page)).toHaveValue('PP-1')

  await issuePencil(alice.page).click()
  await issueBox(alice.page).fill('scrapped')
  await setIssue(bob, 'PP-2')
  await expect(conflictNotice(alice.page)).toBeVisible()
  await issueCancel(alice.page).click()

  await expect(issueBox(alice.page)).toHaveValue('PP-2')
  await expect(issuePencil(alice.page)).toBeVisible()
})

test('a concurrent change shows the notice, and Use theirs takes it', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await issuePencil(alice.page).click()
  await issueBox(alice.page).fill('mine')
  await setIssue(bob, 'PP-2')

  await expect(conflictNotice(alice.page)).toHaveText(/Changed by someone else to: "PP-2"/)
  await expect(issueBox(alice.page)).toHaveValue('mine')
  await alice.page.getByRole('button', { name: 'Use theirs' }).click()
  await expect(issueBox(alice.page)).toHaveValue('PP-2')
  await expect(conflictNotice(alice.page)).toHaveCount(0)
  await expect(issueBox(alice.page)).toHaveJSProperty('readOnly', false)
  // The link-button leaves with the notice, so the box takes focus back for Enter and Escape.
  await expect(issueBox(alice.page)).toBeFocused()
})

test('saving over a concurrent change replaces it', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await issuePencil(alice.page).click()
  await issueBox(alice.page).fill('mine')
  await setIssue(bob, 'PP-2')
  await expect(conflictNotice(alice.page)).toBeVisible()

  await issueCheck(alice.page).click()
  await expect(issueBox(bob.page)).toHaveValue('mine')
  await expect(issueBox(alice.page)).toHaveValue('mine')
  await expect(conflictNotice(alice.page)).toHaveCount(0)
})

test('a double-clicked check posts once', async ({ join, room }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const posts = []
  alice.page.on('request', request => {
    if (request.url().endsWith(`/rooms/${room}/edit-issue`)) posts.push(request.postData())
  })

  await issuePencil(alice.page).click()
  await issueBox(alice.page).fill('mine')
  await issueCheck(alice.page).dblclick()
  await expect(issueBox(bob.page)).toHaveValue('mine')
  // A second POST would follow the first within a round trip; Bob's vote is a later frame.
  await vote(bob.page, '5')
  await expect(votedMark(participantRow(alice.page, 'Bob'))).toHaveCount(1)
  expect(posts).toHaveLength(1)
})

test('a save the network drops keeps the draft and says so', async ({ join, room }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const editIssue = new RegExp(`/rooms/${room}/edit-issue$`)
  await alice.page.route(editIssue, route => route.abort())

  await issuePencil(alice.page).click()
  await issueBox(alice.page).fill('mine')
  await issueCheck(alice.page).click()
  await expect(alice.page.getByText('Could not save the issue')).toBeVisible()
  await expect(issueBox(alice.page)).toHaveValue('mine')
  await expect(issueBox(alice.page)).toHaveJSProperty('readOnly', false)

  await alice.page.unroute(editIssue)
  await issueCheck(alice.page).click()
  await expect(issueBox(bob.page)).toHaveValue('mine')
  await expect(alice.page.getByText('Could not save the issue')).toHaveCount(0)
})
```

In `e2e/refusal.spec.js`, add `issueBox,`, `issueCheck,` and `issuePencil,` after `connectionLost,` in the import list, and append:

```js
test('a save refused by a different instance recovers like any command', async ({ join, room }) => {
  const alice = await join('Alice')
  await alice.page.route(new RegExp(`/rooms/${room}/edit-issue$`), route =>
    route.fulfill({ status: 401 })
  )

  await issuePencil(alice.page).click()
  await issueBox(alice.page).fill('mine')
  await issueCheck(alice.page).click()

  // The reload drops the draft; the failure line before it can last too briefly to assert.
  await expect(restartNotice(alice.page)).toBeVisible({ timeout: 20_000 })
  await expect(issueBox(alice.page)).toHaveValue('')
})
```

Run: `npx prettier --check --single-quote --no-semi --print-width 100 --trailing-comma none --arrow-parens avoid e2e/fixtures.js e2e/room.spec.js e2e/refusal.spec.js && npx eslint e2e`
Expected: `All matched files use Prettier code style!` and no lint output.

- [ ] **Step 7: Show the e2e cases fail against the old editor**

Build the old editor with the new tests, pointing the pencil and check fixtures back at the old class selector, so each case fails on behaviour rather than on a missing name. The stash leaves the untracked `useIssueEditor.ts` in place, which the old editor does not import:

```bash
git stash push -- frontend
npm run build
cp e2e/fixtures.js /tmp/fixtures.new.js
sed -i "s|page.getByRole('button', { name: 'Edit issue' })|page.locator('.input-group-append button')|; s|page.getByRole('button', { name: 'Save issue' })|page.locator('.input-group-append button')|" e2e/fixtures.js
npx playwright test e2e/room.spec.js e2e/refusal.spec.js --project=chromium -g "issue|draft|Enter|cancel|concurrent|save|commit|edit|double"
```

Expected: 6 failed, 5 passed. The failures: "a draft survives blur and room activity" (`Expected: "Alice is still typing"`, `Received: ""`, at the final `toHaveValue`); "Enter saves and Escape cancels" (Bob's box `Expected: "PP-7"`, `Received: ""`); "cancel drops the draft for the room's issue", "a concurrent change shows the notice, and Use theirs takes it", "saving over a concurrent change replaces it" (no notice); and "a save the network drops keeps the draft and says so" (no failure line). The passes: the read-only case and the two kept commit cases, which judge unchanged behaviour, and the refused-save and double-click cases, which Step 8 shows have teeth.

Then restore:

```bash
cp /tmp/fixtures.new.js e2e/fixtures.js
git stash pop
npm run build
```

- [ ] **Step 8: Show the three guards have teeth**

Each mutation below is applied alone, built with `npm run build`, run with the command given, and undone by hand before the next. `git checkout` would lose the uncommitted work.

1. The IME guard. In `IssueEditor.tsx`, change `if (e.nativeEvent.isComposing) return` to `if (e.nativeEvent.isComposing && false) return`.
   Run: `npx playwright test e2e/room.spec.js -g "Enter saves" --project=chromium`
   Expected: FAIL at `toHaveJSProperty('readOnly', false)`, `Received: true`.
2. The 401 report. In `Room.tsx`'s `saveIssue`, delete the `report(reason)` line.
   Run: `npx playwright test e2e/refusal.spec.js -g "save refused" --project=chromium`
   Expected: FAIL at `expect(restartNotice(alice.page)).toBeVisible({ timeout: 20_000 })`.
3. The single POST. In `IssueEditor.tsx`, delete the check's `disabled={!editing}`, and in `useIssueEditor.ts` change `if (state.mode !== 'editing') return` to `if (state.mode === 'viewing' && false) return`.
   Run: `npx playwright test e2e/room.spec.js -g "double-clicked" --project=chromium`
   Expected: FAIL with `Expected length: 1`, `Received length: 2`.

- [ ] **Step 9: Docs**

In `docs/known-issues.md`, delete the whole entry "The issue editor has no cancel, and an unfocused draft is replaced by any room activity", from its `###` heading up to, not including, `### Tests that pass with the mechanism they name deleted, as a recurring pattern`. No roadmap item tracks it.

In `docs/superpowers/specs/2026-09-24-frontend-rewrite-design.md`, change the status line to:

```markdown
Status: Steps 8, 8a and 8b landed; step 8c proposed
```

In `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`, step 8's "Landed." paragraph, replace its closing `ended-session message on a page that never reached the room. Steps 8b and 8c` / `extend this paragraph.` with:

```markdown
ended-session message on a page that never reached the room. Step 8b, the issue
editor, in three commits: `api.ts` aborts a request unanswered after 10 s; the
editor's matrix becomes a pure state machine; and edit mode, not focus, guards
the draft, with a cancel, Enter and Escape, a "Changed by someone else" notice
with "Use theirs", and the saved text shown until a frame moves the room's
issue. Step 8c extends this paragraph.
```

Run: `grep -c $'\u2014' docs/known-issues.md docs/superpowers/specs/2026-09-24-frontend-rewrite-design.md docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`
Expected: each file `0`.

- [ ] **Step 10: Run everything**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: no errors; 78 tests pass.

Run: `npm test`
Expected: 17 pass, 0 fail (its `pretest` builds and stages).

Run: `npx playwright test`
Expected: 102 passed.

- [ ] **Step 11: Check the look by hand**

Run `sbt run` and `npm run dev`, open one room in two browsers, start an edit in one and save a different issue from the other. Expected: under the input, the muted notice `Changed by someone else to: "..."` with a "Use theirs" link-button, as in the spec's mockup; the page below moves down while it shows.

- [ ] **Step 12: Commit**

```bash
git add frontend/src e2e docs
git commit -m "feat(frontend): guard the whole of edit mode, with a cancel and a conflict notice (step 8b)" -m "useIssueEditor holds the previous commit's step() in React. A draft now survives blur and room activity until saved or cancelled; Escape and a new cancel drop it, Enter saves it, and a change by someone else shows beside it with Use theirs. A failed save keeps the draft and says so; a 401 still reaches onRefused. The saved text shows until a frame moves the room's issue, so a stale frame cannot flash the old one. applySnapshot loses issueFocused, and the e2e fixtures find the editor's buttons by their new accessible names."
```

---

### Task 4: The whole branch

- [ ] **Step 1: The spec's "Done when" for 8b**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm test && npx playwright test && sbt scalafmtCheckAll test`
Expected: all green; the regenerate-and-diff gate is unaffected, since no endpoint changed.

- [ ] **Step 2: No em dash, no long comment**

Run: `git diff main --unified=0 | grep '^+' | grep -c $'\u2014'`
Expected: `0`.

Run: `git diff main --unified=0 -- '*.ts' '*.tsx' '*.js' | grep -E '^\+\s*//'` and read the added comments.
Expected: none runs past two lines.

- [ ] **Step 3: Hand over**

Report the commit list, the look check's result, and that nothing is pushed or merged. Remind the user that Review Focus 5, a phone keyboard's Enter, is judged by the rollout's hand test on the Android phone.
