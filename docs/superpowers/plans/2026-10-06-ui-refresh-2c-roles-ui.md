# UI Refresh Step 2c: Roles in the Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the page choose and show a role: the lobby asks for a default role once, every join sends the join role, the room shows a role line with a switch, a facilitator's page has no deck, and a facilitator's row says so.

**Architecture:** One pure module, `room/joinRole.ts`, decodes every stored role and holds every writer of `defaultRole` and `role:<roomId>`, with the storage handed in. `App.tsx` calls it, as it already handles `name` and `roomId`. The room page reads the reader's own seat from the snapshot through `view.ts`, and `api.switchRole` posts `/role`. The server gains no code: Task 1 only adds the reload-gap rows that step 2b handed over to `RoomSpec`'s matrix.

**Tech Stack:** TypeScript, React 19, zod 4, openapi-fetch, vitest, Playwright (Chromium and Firefox). Scala 3 and ScalaTest for Task 1's test rows.

**Spec:** `docs/superpowers/specs/2026-10-04-ui-refresh-2-roles-design.md`: Terms, decisions 6 and 7, "Step 2c. Roles in the page" (all of it, including the two paragraphs step 2b handed over), and Accepted costs. Steps 2a and 2b have landed on this branch's parent.

## How the code in this plan was verified

Every patch below was applied and run in a scratch worktree on 2026-10-06, stacked on `20260930.ui_refresh_2b_roles_wire` at `a6154e5`, as code commits in task order:

- **Task 1.** `RoomSpec` passed 198, up from 182, against unchanged server code. Two mutations of `RoomData.rename` each failed exactly 8 of the 16 new cells and nothing else in the actor suites (Task 1, Step 3).
- **Task 2.** `joinRole.test.ts` passed 15. Each of eight mutations failed only the cases named in Task 2, Step 4. Adding a third role to the generated `Role` failed the typecheck at the decoder, and misspelling the snapshot's `Facilitator` literal failed it at that literal.
- **Task 3.** `npm run test:unit` passed 112. `npm run e2e` passed 122 of 122. Each of five mutations failed the cases its row names (Task 3, Step 7).
- **Task 4.** `npm run test:unit` passed 114, and `npm run e2e` passed 122 of 122 unchanged. Each of two mutations failed the unit case its row names (Task 4, Step 5).
- **Task 5.** `npm run test:unit` passed 114, and `npm run e2e` passed 148 of 148. Each of twelve mutations failed the cases its row names (Task 5, Step 6).
- **Against 2b.** `roles.spec.js`, run with 2b's `frontend/src`, failed all 18 of its cases.
- **Whole step.** `sbt qa styleCheck` passed 353 tests, at 94.17% statement and 91.67% branch coverage. `npm test` passed 17, and `npm run typecheck` and `npm run lint` were clean.
- **Noise to ignore.** sbt prints `[error] WARNING: sun.misc.Unsafe::objectFieldOffset will be removed in a future release` and a `LazyVals` warning from the forked JVM's stderr. Neither is a failure.

## Browser storage, states by events

The spec's rules ("What the browser stores", "The join role", "The lobby") checked cell by cell before any code was written. Rows are the events and columns what this browser holds for the page's room. *N* is `name`, *D* the decoded `defaultRole`, *K* the decoded `role:<roomId>` for the page's room, and *shown* the role the lobby's control shows.

| Event | Nothing stored | N only (before roles) | N and D | N, D and K | A bad D or K |
| --- | --- | --- | --- | --- | --- |
| Load a room's path, after any redirect | lobby, fieldset on Voter | lobby, N prefilled, fieldset on Voter; no join sent | auto-join, sends D | auto-join, sends K | a bad D reads as none, so the lobby shows; a bad K is skipped, so D is sent |
| Load the root | Create tab, fieldset | fieldset, N, the Rejoin link if `roomId` is stored | the line "Default role for new rooms: D", with Change | as N and D | a bad D shows the fieldset |
| A choice in the fieldset | D := choice, at once; the form stays | as nothing stored | (after Change) D := choice; the fieldset stays open | as N and D | D := choice |
| Change | cannot happen: no line | cannot happen | the fieldset, holding D as stored now, which another tab may have changed since the load | as N and D | cannot happen: a bad D shows the fieldset |
| Create succeeds | D := shown; K of the new id removed; navigate | as nothing stored | D kept; K of the new id removed | as N and D | a bad D is replaced by shown |
| Create fails | D := shown; the error shows | as nothing stored | D kept; the error shows | as N and D | as nothing stored |
| Join at the root | D := shown; navigate, and the path's load decides | as nothing stored | D kept; navigate | as N and D | a bad D is replaced by shown |
| Join on a room's path | D := shown; sends K, else D | as nothing stored | sends D | sends K | a bad D is replaced by shown |
| The join fails | the error shows; nothing else is written; Join retries | same | same | same | same |
| A snapshot holding the own seat | cannot happen: no join yet | cannot happen | K := the seat's role | K := the seat's role | K := the seat's role, over a bad one |
| A switch answers 204 | cannot happen: not in a room | cannot happen | K := the new role | K := the new role | K := the new role |
| A switch answers 401 | cannot happen | cannot happen | `refused()` checks the app, whose reload joins with K unchanged | same | same |
| A switch fails otherwise, or times out | cannot happen | cannot happen | logged; the line and K unchanged; a later snapshot writes K if the server applied it | same | same |
| Reload | as loading the path | as loading the path | the beacon, then the path's auto-join with K or D | same | same |
| Leave | cannot happen | cannot happen | removes `roomId` only; N, D and K stay | same | same |
| Another tab stores a D | this tab's form keeps its shape; its submit joins with the stored D | same | the line keeps showing the old D until a load or Change | same | same |
| A snapshot in another tab of this room | cannot happen: no session | cannot happen | K := the seat's role, which the same session shares | same | same |
| The stream is lost and back, or a restart reloads | cannot happen | cannot happen | snapshots resume and write K; a restart's reload auto-joins with K | same | same |

*D* without *N*, a choice in the fieldset and then no submit, reads as the *N and D* column with an empty name: the root shows the line, and a room's path shows its lobby, since the auto-join needs *N* too.

"Cannot happen" for a snapshot without the reader's own seat: the room sends a snapshot only to a member's connections, and a connection whose member has ended is "tolerated by of, produced by nothing" (`RoomDataFixtures.withDeparted`). If one came, the page would show no role line and the deck, and write no key.

Accepted races, beside the spec's Accepted costs:

- A frame the server sent before a switch, still on the stream when the 204 lands, writes the old role back, and the next frame, right behind it on the same stream, writes the new one. Only a stall between those two frames followed by a reload shows it, the same outcome as the spec's lost 204 while the stream is stalled.
- Two tabs on one room switching within a round trip end on whichever switch the server applied last, and every tab stores that from its snapshot.
- One person switching twice within a round trip can see the first switch's 204 land after the second switch's frame, writing the first role back. The next snapshot writes the seat's role again, so only a reload inside that gap rejoins with the first role, which the role line then shows.

## Decisions this plan takes that the spec does not settle

Each is implemented as written unless review changes it.

- **P1. Five code commits, each judged differently.** Task 1 is judged by `RoomSpec` against unchanged server code. Task 2 is judged by `joinRole.test.ts`. Task 3, the room page, is judged by unit cases and by e2e cases whose facilitators come from the role line, while every join still sends `Voter`. Task 4 carries the role through `api.join` and `Connection.join`, with `App` still passing `Voter`: judged by unit cases and an e2e suite that passes unchanged. Task 5, the lobby and the join role, is judged by e2e cases that seed storage or choose a default in the lobby.
- **P2. The reload gap is two matrix rows per phase.** `SeatCell` gains `aPresent`, and `row(..., aPresent = false)` starts A as the beacon leaves it: a session and a seat, but no member (`withMemberlessSession`). The rows are "A joins as a voter while not present" and "A joins as a facilitator while not present", in both phases. This settles the first item step 2b handed over.
- **P3. `Role` is the generated type, beside `Seat`, and both ends are guarded.** `protocol/snapshot.ts` exports `type Role = components['schemas']['Role']`, and each seat literal is written `z.literal('Voter' satisfies Role)`, so a renamed seat tag fails the typecheck at the literal. `joinRole.ts` decodes through a `Record<Role, true>`, so a role added to the schema fails the build there. Every role a module stores or sends is typed `Role`; `view.ts` reads `Seat['type']`, which the `satisfies` literals keep assignable to it. This settles the second item step 2b handed over.
- **P4. One module holds every role read and write, with the storage handed in.** `RoleStorage` is `Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>`, so vitest runs it in node over a `Map`. `App.tsx` makes the calls, as it already does for `name` and `roomId`, and not `Room.tsx`: the parent spec's principle 8 keeps storage out of the markup step 4 restyles.
- **P5. `keepDefault` returns the stored default.** A lobby submit and the auto-join both send `joinRole(storage, pathRoom, keepDefault(storage, shownRole))`. A stale tab's submit therefore joins with the stored default, the spec's accepted cost, and the auto-join needs no second path.
- **P6. The remembered role is written in an `App` effect on each snapshot,** as the spec words it, rather than only when the role changes. The two are equivalent in every cell above, and the literal reading needs no comparison.
- **P7. Change's fieldset stays open until the next load.** The spec says a choice is stored at once and does not say the line returns. `choosingRole` is set at mount and only Change sets it again.
- **P8. A `visitor` fixture seeds storage through `storageState`.** That writes `localStorage` once per context, before the first `goto`, as the spec's contract requires. The one existing case that seeds storage, `slug.spec.js`'s "a room remembered from before the cutover", moves to it from an init script that ran on every load.

## Consequences the spec or the code already settle

- **`view.ts`** gains `facilitator` on `ParticipantRow` and `ownRole` on `View`, read by an exported `ownRoleOf`. A facilitator's row already has no estimation (step 2b), so the tally and the revealed `participant-estimation` cell need nothing new.
- **`Participants.tsx`** shows `Facilitator` in the Voted cell instead of the mark.
- **`Connection.join` and `api.join` take the role,** and `api.ts` loses 2b's "every join is a voter's" comment. `main.tsx` passes `api.join` as before.
- **`Room.tsx`** renders `Deck` only for a non-facilitator. Controls, the issue editor, results and participants are unchanged, so a facilitator keeps every control.
- **Failures of `/role` go through `run`,** like Show and Clear: a 401 reaches `refused()`, and anything else is logged.
- **Commits.** This plan lands first, as `docs: plan ui refresh step 2c`; the code commits follow as P1 lists them; `docs: mark ui refresh step 2c landed` comes last, setting the spec's status line and ticking the roadmap's roles item.

## Global Constraints

- No em dash anywhere: code, comments, docs and commit messages.
- Code comments are one or two lines, never more.
- Conventional Commits, and no generated-with or co-authored-by attribution line.
- TypeScript and JavaScript lines stay within 100 columns by hand; nothing formats them. Scala formatting is scalafmt's: run `sbt scalafmtAll` before Task 1's commit, and `sbt styleCheck` must pass.
- Cite symbols, not line numbers, in comments and commit messages.
- Mutation steps run before their task's commit, so undo a mutation by reverting its own edit. `git checkout` is safe only on a file the task leaves alone, such as `src/main` or `frontend/src/protocol/generated`; on a file the task changed it also drops the task's work.
- The role strings are exactly `Voter` and `Facilitator`; the storage keys are exactly `defaultRole` and `role:<roomId>`.
- The contract strings are exactly those of the spec's "The contract" table: `Your default role`, `Voter`, `Facilitator`, `Default role for new rooms: Voter` or `: Facilitator`, `Change`, `Switch to facilitator`, `Switch to voter`.
- Must not change: anything under `src/main/`; existing e2e cases other than `slug.spec.js`'s "a room remembered from before the cutover reopens under its derived name"; `frontend/src/protocol/generated/`; the protocol architecture spec.
- The suite never reads `localStorage`; it seeds it only through `visitor`.
- Do not push or merge: 2a, 2b and 2c are stacked and merge in one window (spec, "Branches and commits"), and every merge to `main` restarts the server and ends every live room.

## Review Focus

The inputs most likely to bite a person, most likely first.

1. **A regular user's first visit after the deploy,** with a remembered name and no default role. Expected: the room's lobby, the name prefilled, Voter chosen, and no join sent until they press Join. Pinned by Task 5's "a regular user from before roles gets the lobby on Voter, and joins on Join".
2. **A facilitator reloading mid-round.** Expected: they rejoin as a facilitator, and the round does not reveal. Pinned by Task 5's "a facilitator stays one across a reload", where the default and the remembered role are both Facilitator; by the reloads in "a switch survives a reload while the stream is frozen" and "a switch in one room changes neither another room's role nor the default", where the remembered role differs from the default; and by Task 1's "A joins as a facilitator while not present" rows, which pin that the round does not reveal.
3. **A switch while the stream is frozen, then a reload.** Expected: the reload keeps the switch, from the 204's write. Pinned by Task 5's "a switch survives a reload while the stream is frozen".
4. **A browser holding garbage under `defaultRole` or `role:<roomId>`.** Expected: a bad default shows the lobby and a submit replaces it; a bad room role is skipped for the default. Pinned by Task 2's "a stored value other than the two roles" cases and Task 5's "a malformed default role reaches the lobby, and a submit keeping Voter stores it".
5. **A keyboard user pressing the switch.** Expected: focus stays on the button, now labelled for the other role. Pinned by Task 3's "a switch keeps keyboard focus on its one button".

---

### Before Task 1: commit this plan

```bash
git add docs/superpowers/plans/2026-10-06-ui-refresh-2c-roles-ui.md
git commit -m "docs: plan ui refresh step 2c"
git status --short
```

Expected: `git status --short` prints nothing.

### Task 1: Pin a join while not present in the seat matrix

**Files:**
- Modify: `src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala`

**Interfaces:**
- Consumes: 2b's `SeatCell`, `row`, `SeatEvent.AJoins`, `withMemberlessSession` and `withSeat`.
- Produces: nothing later tasks use.

- [ ] **Step 1: Let a cell start with A not present**

In `RoomSpec.scala`, in `"A seat" should`, replace:

```scala
        val seated       = withUsers(a, b).withSeat(a, cell.aSeat).withSeat(b, cell.bSeat)
```

with:

```scala
        // Not present is what the beacon leaves: a session and a seat, but no member.
        val people =
          if cell.aPresent then withUsers(a, b) else withUsers(b).withMemberlessSession(a)
        val seated       = people.withSeat(a, cell.aSeat).withSeat(b, cell.bSeat)
```

In `final case class SeatCell`, replace:

```scala
      bSeat: Room.Seat,
      aSeat: Room.Seat,
      outcome: Outcome
  ):
```

with:

```scala
      bSeat: Room.Seat,
      aPresent: Boolean,
      aSeat: Room.Seat,
      outcome: Outcome
  ):
```

Replace the `row` helper's signature and its last line:

```scala
  private def row(phase: Phase, name: String, event: SeatEvent, bSeat: Room.Seat = bConfirmed)(
      outcomes: Outcome*
  ): List[SeatCell] =
```

with:

```scala
  private def row(
      phase: Phase,
      name: String,
      event: SeatEvent,
      bSeat: Room.Seat = bConfirmed,
      aPresent: Boolean = true
  )(outcomes: Outcome*): List[SeatCell] =
```

and:

```scala
      .map((aSeat, outcome) => SeatCell(phase, name, event, bSeat, aSeat, outcome))
```

with:

```scala
      .map((aSeat, outcome) => SeatCell(phase, name, event, bSeat, aPresent, aSeat, outcome))
```

- [ ] **Step 2: Add the rows**

In `seatCells`, before `row(Open, "A presses Show", AShows)(`, insert:

```scala
    // The reload gap: the beacon has removed A, and the reload's join lands before A's stream.
    row(Open, "A joins as a voter while not present", AJoins(Voter), aPresent = false)(
      hidden(noVote),
      hidden(confirmed),
      hidden(unconfirmed),
      hidden(noVote)
    ),
    row(Open, "A joins as a facilitator while not present", AJoins(Facilitator), aPresent = false)(
      hidden(facilitator),
      hidden(facilitator),
      hidden(facilitator),
      hidden(facilitator)
    ),
```

Before `row(Revealed, "A presses Show", AShows)(`, insert:

```scala
    row(Revealed, "A joins as a facilitator while not present", AJoins(Facilitator), aPresent = false)(
      revealed(facilitator),
      revealed(facilitator),
      revealed(facilitator),
      revealed(facilitator)
    ),
    row(Revealed, "A joins as a voter while not present", AJoins(Voter), aPresent = false)(
      revealed(noVote),
      revealed(confirmed),
      revealed(unconfirmed),
      revealed(noVote)
    ),
```

Run `sbt scalafmtAll`. It realigns the four `val`s above `people`, splits the long `Revealed` row over five lines, and inserts `end row` after the grown `row` helper; all three are expected.

```bash
sbt -batch scalafmtAll styleCheck "testOnly com.lunatech.pointingpoker.actors.RoomSpec"
```

Expected: `Tests: succeeded 198, failed 0`. Every not-present open cell starts complete, since only B is present and has voted, so "never reveals" is what they pin.

- [ ] **Step 3: Show the rows bite**

Apply each mutation to `Room.scala`'s `RoomData.rename` alone, run `sbt -batch "testOnly com.lunatech.pointingpoker.actors.*"`, then restore with `git checkout src/main`.

| Mutation | Fails |
| --- | --- |
| Apply the role only to a present identity: replace the `.copy(...).switched(userId, role)` chain with `val renamed = this.copy(...)` and `if this.members.contains(userId) then renamed.switched(userId, role) else renamed` | 8: every "while not present" cell whose seat changes (open and revealed, voter from `Facilitator`, facilitator from the three voter seats) |
| Latch on a join while absent: append `.pipe(d => if this.members.contains(userId) then d else d.latched)` after `.switched(userId, role)`, with `import scala.util.chaining.*` after the `scala.concurrent.duration` import | 8: every open-round "while not present" cell |

Expected: each fails exactly those 8, and nothing else in the actor suites.

- [ ] **Step 4: Commit**

```bash
git add src/test/scala/com/lunatech/pointingpoker/actors/RoomSpec.scala
git commit -m "test: pin a join while not present in the seat matrix (ui refresh step 2c)" -m "A reload sends the leave beacon before its join, so a facilitator's reload joins while not present. The matrix's join rows all had A present; these rows start A as the beacon leaves it, and pin that such a join applies its role and never reveals."
git status --short
```

Expected: `git status --short` prints nothing.

### Task 2: Decide the join role in one pure module

**Files:**
- Create: `frontend/src/room/joinRole.ts`
- Create: `frontend/src/room/joinRole.test.ts`
- Modify: `frontend/src/protocol/snapshot.ts`

**Interfaces:**
- Consumes: `components['schemas']['Role']` from `frontend/src/protocol/generated/openapi.d.ts`, `"Facilitator" | "Voter"` since 2b.
- Produces, for Tasks 3 to 5:
  - `type Role = components['schemas']['Role']`, exported from `protocol/snapshot.ts`;
  - `type RoleStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>`;
  - `storedDefault(storage: RoleStorage): Role | null`;
  - `chooseDefault(storage: RoleStorage, role: Role): void`;
  - `keepDefault(storage: RoleStorage, shown: Role): Role`;
  - `joinRole(storage: RoleStorage, roomId: string, defaultRole: Role): Role`;
  - `rememberRole(storage: RoleStorage, roomId: string, role: Role): void`;
  - `forgetRole(storage: RoleStorage, roomId: string): void`.

- [ ] **Step 1: Write the failing scenario cases**

Create `frontend/src/room/joinRole.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  chooseDefault,
  forgetRole,
  joinRole,
  keepDefault,
  rememberRole,
  storedDefault,
  type RoleStorage
} from './joinRole'

// localStorage's semantics over a Map, seeded as a browser could have left it.
const storage = (seed: Record<string, string> = {}) => {
  const items = new Map(Object.entries(seed))
  const fake: RoleStorage = {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: key => void items.delete(key)
  }
  return { fake, items: () => Object.fromEntries(items) }
}

const room = 'brave-golden-otter'
const other = 'calm-silver-heron'

describe('a stored value other than the two roles', () => {
  it.each(['', 'voter', 'Observer', 'null'])('reads as no default role: %j', value => {
    expect(storedDefault(storage({ defaultRole: value }).fake)).toBeNull()
  })

  it.each(['', 'facilitator', 'Observer', 'null'])('is skipped as a remembered role: %j', value => {
    const { fake } = storage({ [`role:${room}`]: value })
    expect(joinRole(fake, room, 'Voter')).toBe('Voter')
  })

  it('is replaced by a submit, which keeps what the lobby showed', () => {
    const { fake, items } = storage({ defaultRole: 'Observer' })
    expect(keepDefault(fake, 'Voter')).toBe('Voter')
    expect(items()).toEqual({ defaultRole: 'Voter' })
  })
})

describe('the join role', () => {
  it('takes the remembered role, else the default', () => {
    const { fake } = storage({ [`role:${room}`]: 'Facilitator' })
    expect(joinRole(fake, room, 'Voter')).toBe('Facilitator')
    expect(joinRole(fake, other, 'Voter')).toBe('Voter')
  })

  it('takes the remembered role over a default a first visit just set', () => {
    const { fake } = storage({ [`role:${room}`]: 'Facilitator' })
    expect(joinRole(fake, room, keepDefault(fake, 'Voter'))).toBe('Facilitator')
  })

  it('takes the default once Create forgets the room', () => {
    const { fake } = storage({ [`role:${room}`]: 'Voter', defaultRole: 'Facilitator' })
    forgetRole(fake, room)
    expect(joinRole(fake, room, keepDefault(fake, 'Voter'))).toBe('Facilitator')
  })
})

describe('the default role', () => {
  it('is stored by a submit only when none is', () => {
    const { fake, items } = storage({ defaultRole: 'Facilitator' })
    expect(keepDefault(fake, 'Voter')).toBe('Facilitator')
    expect(items()).toEqual({ defaultRole: 'Facilitator' })
  })

  it('is overwritten by each choice', () => {
    const { fake } = storage()
    chooseDefault(fake, 'Facilitator')
    chooseDefault(fake, 'Voter')
    expect(storedDefault(fake)).toBe('Voter')
  })

  it("is not written by a room's role, which writes only its own room's key", () => {
    const { fake, items } = storage({ defaultRole: 'Voter', [`role:${other}`]: 'Voter' })
    rememberRole(fake, room, 'Facilitator')
    expect(items()).toEqual({
      defaultRole: 'Voter',
      [`role:${other}`]: 'Voter',
      [`role:${room}`]: 'Facilitator'
    })
  })
})
```

Run: `npx vitest run --root frontend src/room/joinRole.test.ts`
Expected: FAIL, the module `./joinRole` does not exist.

- [ ] **Step 2: Name the role beside the seat, then write the module**

In `frontend/src/protocol/snapshot.ts`, replace `import { z } from 'zod'` with:

```ts
import { z } from 'zod'
import type { components } from './generated/openapi'

// The server's one table of role tags, so gen:api and the typecheck catch a renamed role.
export type Role = components['schemas']['Role']
```

and replace the `seat` union and its comment with:

```ts
  // A facilitator's seat has no estimation, so it cannot carry one; each tag must be a Role.
  const seat = z.discriminatedUnion('type', [
    object({ type: z.literal('Voter' satisfies Role), estimation }),
    object({ type: z.literal('Facilitator' satisfies Role) })
  ])
```

Create `frontend/src/room/joinRole.ts`:

```ts
import type { Role } from '../protocol/snapshot'

// The slice of localStorage this module uses, so a test can hand it a Map.
export type RoleStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

// Keyed by Role, so a role added to the schema fails the build here until it is decoded.
const roles: Record<Role, true> = { Voter: true, Facilitator: true }
const DEFAULT_KEY = 'defaultRole'
const roomKey = (roomId: string) => `role:${roomId}`

// Any other stored string counts as none, so a bad value is skipped rather than sent and refused.
const decode = (stored: string | null): Role | null =>
  stored !== null && Object.hasOwn(roles, stored) ? (stored as Role) : null

export const storedDefault = (storage: RoleStorage): Role | null =>
  decode(storage.getItem(DEFAULT_KEY))

// A choice in the "Your default role" fieldset, stored at once.
export const chooseDefault = (storage: RoleStorage, role: Role) =>
  storage.setItem(DEFAULT_KEY, role)

// A lobby submit stores the shown role only when none is stored, and returns the stored one.
export function keepDefault(storage: RoleStorage, shown: Role): Role {
  const stored = storedDefault(storage)
  if (stored !== null) return stored
  chooseDefault(storage, shown)
  return shown
}

// The room's remembered role, else the default role (the roles spec's Terms).
export const joinRole = (storage: RoleStorage, roomId: string, defaultRole: Role): Role =>
  decode(storage.getItem(roomKey(roomId))) ?? defaultRole

// Written from the page's own seat in each snapshot, and by a 204 from /role.
export const rememberRole = (storage: RoleStorage, roomId: string, role: Role) =>
  storage.setItem(roomKey(roomId), role)

// Create's only: a reused slug must not inherit the role of the room it named before.
export const forgetRole = (storage: RoleStorage, roomId: string) =>
  storage.removeItem(roomKey(roomId))
```

- [ ] **Step 3: Run the checks**

```bash
npx vitest run --root frontend src/room/joinRole.test.ts
npm run typecheck && npm run lint
```

Expected: `Tests  15 passed (15)`; the typecheck and lint print no error.

- [ ] **Step 4: Show each rule bites**

Apply each mutation to `joinRole.ts` alone, rerun the file, then restore it.

| Mutation | Fails |
| --- | --- |
| `decode` accepts any string: `stored !== null ? (stored as Role) : null` | the 8 bad-value cases and "is replaced by a submit" |
| The default outranks the room: `defaultRole ?? decode(...)` in `joinRole` | "takes the remembered role, else the default", "takes the remembered role over a default a first visit just set" |
| `keepDefault` tests presence, not a role: `const stored = storage.getItem(DEFAULT_KEY) as Role \| null` | "is replaced by a submit, which keeps what the lobby showed" |
| `keepDefault` always writes: delete `if (stored !== null) return stored` | "takes the default once Create forgets the room", "is stored by a submit only when none is" |
| `forgetRole` removes the wrong key: `storage.removeItem(roomId)` | "takes the default once Create forgets the room" |
| `rememberRole` also writes the default: give it a block body, `{ storage.setItem(roomKey(roomId), role); storage.setItem(DEFAULT_KEY, role) }` | "is not written by a room's role, which writes only its own room's key" |
| `roomKey` is the same for every room: `(_roomId: string) => 'role'` | "takes the remembered role, else the default", "takes the remembered role over a default a first visit just set", "is not written by a room's role" |
| `chooseDefault` writes only when none is stored: `if (storage.getItem(DEFAULT_KEY) === null)` | "is overwritten by each choice", "is replaced by a submit, which keeps what the lobby showed" |

Then check both ends of `Role`, undoing each edit before the next:

- Add `| "Observer"` to `Role` in `frontend/src/protocol/generated/openapi.d.ts` and run `npm run typecheck`. Expected: `TS2741: Property 'Observer' is missing` at `roles`. Undo with `git checkout frontend/src/protocol/generated`.
- Change `'Facilitator' satisfies Role` in `snapshot.ts` to `'Facilitatr' satisfies Role` and run `npm run typecheck`. Expected: `TS1360` at that literal, plus `TS2820` at `view.test.ts`'s fixture, which compares with the old tag. Tasks 3 and 5 add more such incidental errors; the literal's is the guard. Undo by editing the literal back, not with `git checkout`, which would also drop Step 2's `Role`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/protocol/snapshot.ts frontend/src/room/joinRole.ts frontend/src/room/joinRole.test.ts
git commit -m "feat: decide the join role in one pure module (ui refresh step 2c)" -m "Every read of defaultRole and role:<roomId> decodes, so a stored value other than the two roles counts as none. The join role is the room's remembered role, else the default. The module holds every writer of both keys, with the storage handed in, so the rules run in node. Role is the generated type, named beside Seat, and each seat literal must satisfy it."
git status --short
```

Expected: `git status --short` prints nothing.

### Task 3: Show the role line, and give a facilitator's page no deck

**Files:**
- Create: `frontend/src/components/RoleLine.tsx`
- Create: `e2e/roles.spec.js`
- Modify: `frontend/src/room/view.ts`, `frontend/src/room/view.test.ts`
- Modify: `frontend/src/protocol/api.ts`, `frontend/src/protocol/api.test.ts`
- Modify: `frontend/src/components/Room.tsx`, `frontend/src/components/Participants.tsx`
- Modify: `e2e/fixtures.js`

**Interfaces:**
- Consumes: Task 2's `Role`.
- Produces, for Tasks 4 and 5:
  - `ownRoleOf(s: RoomSnapshot): Seat['type'] | null` in `view.ts`, and `View.ownRole`;
  - `api.switchRole(roomId: string, role: Role): Promise<void>`;
  - the fixtures `switchTo(page, role)`, with `role` `'facilitator'` or `'voter'`, and `facilitatorMark(entry)`;
  - `e2e/roles.spec.js` with its import block and `becomeFacilitator`;
  - `describe('a role')` in `api.test.ts`, one row per request that carries a role.

- [ ] **Step 1: Write the failing view cases**

In `view.test.ts`, after the case "gives a facilitator's row no estimation, so the tally leaves them out", insert:

```ts
  it("marks a facilitator's row, and only theirs", () => {
    const s = snap([facilitator('a'), row('b', confirmed('5')), row('c', none)])
    expect(applySnapshot(s).users.map(u => u.facilitator)).toEqual([true, false, false])
  })

  it("reads the reader's own role from their seat", () => {
    expect(applySnapshot(snap([facilitator('a'), row('b', none)])).ownRole).toBe('Facilitator')
    expect(applySnapshot(snap([row('a', none), facilitator('b')])).ownRole).toBe('Voter')
    expect(applySnapshot(snap([facilitator('b')])).ownRole).toBeNull()
  })
```

Run: `npm run test:unit`
Expected: FAIL in the two new cases, `facilitator` and `ownRole` being undefined.

- [ ] **Step 2: Read the role off the snapshot**

In `view.ts`, add `facilitator: boolean` to `ParticipantRow` after `name: string`, and in `toRow`'s returned object add, after `name,`:

```ts
    facilitator: seat.type === 'Facilitator',
```

Add to `View`, as its first field:

```ts
  ownRole: Seat['type'] | null
```

Before `export function applySnapshot`, insert:

```ts
// Null only for a snapshot without the reader, which the server never sends.
export const ownRoleOf = (s: RoomSnapshot): Seat['type'] | null =>
  s.users.find(u => u.id === s.you)?.seat.type ?? null

```

and in `applySnapshot`'s returned object add, as its first field:

```ts
    ownRole: ownRoleOf(s),
```

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 3: Add `switchRole`**

In `api.ts`, add `import type { Role } from './snapshot'` after the `./generated/openapi` import, and before `export async function vote(` insert:

```ts
export async function switchRole(roomId: string, role: Role): Promise<void> {
  const { response } = await timed(signal =>
    client.POST('/rooms/{roomId}/role', { params: { path: { roomId } }, body: { role }, signal })
  )
  if (!response.ok) throw refused('role', response)
}

```

In `api.test.ts`, add `switchRole,` to the import after `REQUEST_TIMEOUT_MS,`, and to `requests` after `vote`:

```ts
  switchRole: () => switchRole('brave-golden-otter', 'Facilitator'),
```

so "fails once unanswered for 10 s" covers it, and before `describe('a request', () => {` insert:

```ts
describe('a role', () => {
  it.each([['switchRole', requests.switchRole, { role: 'Facilitator' }]])(
    'is sent in the body of %s',
    async (_, call, body) => {
      fetchMock.mockImplementation(async () => new Response(null, { status: 204 }))
      await call()
      expect(await fetchMock.mock.calls[0][0].json()).toEqual(body)
    }
  )
})

```

- [ ] **Step 4: Render the role line, the deck and the row**

The role line is the first row of the card body, under the header and above the issue, styled as a link button. It is hidden, and the deck shown, when the snapshot lacks the reader's seat, which cannot happen (see "Cannot happen" under the matrix).

Create `frontend/src/components/RoleLine.tsx`:

```tsx
import type { Role } from '../protocol/snapshot'

type Props = { role: Role; onSwitch: (role: Role) => void }

// One button whose label changes, so keyboard focus survives the switch.
export function RoleLine({ role, onSwitch }: Props) {
  const facilitator = role === 'Facilitator'
  return (
    <div className="row mb-3">
      <div className="col">
        {facilitator ? 'You are a facilitator.' : 'You are a voter.'}{' '}
        <button
          type="button"
          className="btn btn-link p-0 align-baseline"
          onClick={() => onSwitch(facilitator ? 'Voter' : 'Facilitator')}
        >
          {facilitator ? 'Switch to voter' : 'Switch to facilitator'}
        </button>
      </div>
    </div>
  )
}
```

In `Room.tsx`, add `import { RoleLine } from './RoleLine'` after the `Results` import, and replace:

```tsx
          <div className="card-body">
            <IssueEditor issue={view.currentIssue} onSave={saveIssue} />
            <Deck view={view} onVote={vote} />
```

with:

```tsx
          <div className="card-body">
            {view.ownRole && (
              <RoleLine
                role={view.ownRole}
                onSwitch={role => run(api.switchRole(roomId, role))}
              />
            )}
            <IssueEditor issue={view.currentIssue} onSave={saveIssue} />
            {view.ownRole !== 'Facilitator' && <Deck view={view} onVote={vote} />}
```

In `Participants.tsx`, replace:

```tsx
                <td>{u.voted && <CircleCheckBig size={20} role="img" aria-label="Voted" />}</td>
```

with:

```tsx
                <td>
                  {u.facilitator
                    ? 'Facilitator'
                    : u.voted && <CircleCheckBig size={20} role="img" aria-label="Voted" />}
                </td>
```

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: clean, and `Tests  112 passed (112)`.

- [ ] **Step 5: Add the contract helpers**

In `e2e/fixtures.js`, before `// The legacy-link banner`, insert:

```js
// The role line's one button, named for the role it switches to: 'facilitator' or 'voter'.
export const switchTo = (page, role) => page.getByRole('button', { name: `Switch to ${role}` })
// What a facilitator's row shows in place of the voted mark.
export const facilitatorMark = entry => entry.getByText('Facilitator', { exact: true })

```

- [ ] **Step 6: Write the room cases**

The role cases get a file of their own. Besides the spec's cases, one pins the spec's one-button rule, which no listed case covers and a restyle breaks most easily. Create `e2e/roles.spec.js`:

```js
import {
  test,
  expect,
  card,
  deck,
  expectSummaryMatchesParticipants,
  facilitatorMark,
  frozenNotice,
  ownEstimation,
  participantEntry,
  results,
  revealedEstimation,
  switchTo,
  tallyEntries,
  unconfirmedCard,
  vote,
  votedMark
} from './fixtures.js'

// Through the role line, then seen by another page, so the switch has landed when this returns.
const becomeFacilitator = async (who, watcher) => {
  await switchTo(who.page, 'facilitator').click()
  await expect(switchTo(who.page, 'voter')).toBeVisible()
  await expect(facilitatorMark(participantEntry(watcher.page, who.name))).toHaveCount(1)
}

test('a room with a facilitator auto-reveals when the voters finish', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const carol = await join('Carol')
  await becomeFacilitator(alice, bob)

  await vote(bob.page, '3')
  await vote(carol.page, '5')
  await expect(results(alice.page)).toBeVisible()
  await expect(revealedEstimation(participantEntry(alice.page, 'Bob'))).toHaveText('3')
  await expect(revealedEstimation(participantEntry(alice.page, 'Carol'))).toHaveText('5')
})

test('the last waiting voter switching to facilitator reveals the round', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  await vote(alice.page, '5')
  await expect(votedMark(participantEntry(bob.page, 'Alice'))).toHaveCount(1)
  await expect(results(bob.page)).toBeHidden()

  await becomeFacilitator(bob, alice)
  await expect(results(alice.page)).toBeVisible()
  await expect(revealedEstimation(participantEntry(alice.page, 'Alice'))).toHaveText('5')
})

test('a switch to facilitator drops the vote from the results', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  await vote(alice.page, '3')
  await vote(bob.page, '8')
  await expect(tallyEntries(alice.page)).toHaveCount(2)

  await becomeFacilitator(bob, alice)
  await expect(tallyEntries(alice.page)).toHaveCount(1)
  await expect(revealedEstimation(participantEntry(alice.page, 'Bob'))).toHaveText('')
  await expectSummaryMatchesParticipants(alice.page)

  // Switching back starts with no estimate, and the round stays revealed.
  await switchTo(bob.page, 'voter').click()
  await expect(deck(bob.page)).toBeVisible()
  await expect(ownEstimation(bob.page)).toHaveCount(0)
  await expect(card(bob.page, '8')).toBeDisabled()
})

test("a facilitator's page has no deck, and keeps Show, Re-vote and Clear", async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  await becomeFacilitator(alice, bob)
  await expect(deck(alice.page)).toHaveCount(0)

  await vote(bob.page, '5')
  // Bob is the only voter, so his vote reveals; Re-vote then reopens it for the Show below.
  await expect(frozenNotice(bob.page)).toBeVisible()
  await expect(frozenNotice(alice.page)).toHaveCount(0)
  await alice.page.getByRole('button', { name: 'Re-vote' }).click()
  await expect(unconfirmedCard(bob.page)).toHaveText('5')
  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await expect(frozenNotice(bob.page)).toBeVisible()
  await alice.page.getByRole('button', { name: 'Clear votes' }).click()
  await expect(frozenNotice(bob.page)).toBeHidden()
  await expect(ownEstimation(bob.page)).toHaveCount(0)
  await expect(deck(alice.page)).toHaveCount(0)
})

// The spec's one-button rule: a restyle rendering one button per role would drop focus.
test('a switch keeps keyboard focus on its one button', async ({ join }) => {
  const alice = await join('Alice')
  await switchTo(alice.page, 'facilitator').focus()
  await alice.page.keyboard.press('Enter')
  await expect(switchTo(alice.page, 'voter')).toBeFocused()
})
```

```bash
npx eslint e2e
npm run e2e -- e2e/roles.spec.js
```

Expected: `10 passed`, five cases on Chromium and Firefox.

- [ ] **Step 7: Show the cases bite, then run everything**

Apply each mutation alone, run `npm run e2e -- e2e/roles.spec.js --project=chromium` for the e2e rows or `npm run test:unit` for the unit row, then restore the file. `npm run e2e` rebuilds the page and stages the server first, so the `Room.scala` row is picked up; a bare `npx playwright test` would run the last build.

| Mutation | Fails |
| --- | --- |
| `Room.tsx` renders `<Deck view={view} onVote={vote} />` for everyone | "a facilitator's page has no deck, and keeps Show, Re-vote and Clear" (deck count) |
| `RoleLine.tsx` renders two buttons, `key="v"` and `key="f"`, one per role | "a switch keeps keyboard focus on its one button" |
| `api.ts`: `switchRole` sends `role: 'Voter'` | unit: "is sent in the body of switchRole" |
| `RoleLine.tsx` always sends `onSwitch('Facilitator')` | "a switch to facilitator drops the vote from the results" (the deck after switching back) |
| `Room.scala`'s `complete` uses `confirmations.exists(identity)` | "the last waiting voter switching to facilitator reveals the round" (the hidden check), and the two other voting cases, whose second vote finds the round revealed. Without the wait for Alice's voted mark, the hidden check passed 10 of 10 under this mutation |

Then:

```bash
npm run e2e
```

Expected: `122 passed`.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/RoleLine.tsx frontend/src/components/Room.tsx \
  frontend/src/components/Participants.tsx frontend/src/room/view.ts frontend/src/room/view.test.ts \
  frontend/src/protocol/api.ts frontend/src/protocol/api.test.ts e2e/fixtures.js e2e/roles.spec.js
git commit -m "feat: show the role line, and give a facilitator's page no deck (ui refresh step 2c)" -m "A line under the room header says which role the page holds, with one button that switches it through POST /role. A facilitator's page renders no deck and keeps every control, and a facilitator's row says Facilitator in the Voted column. Joins still send Voter until the lobby offers a default role."
git status --short
```

Expected: `git status --short` prints nothing.

### Task 4: Carry the role through the join

**Files:**
- Modify: `frontend/src/protocol/api.ts`, `frontend/src/protocol/api.test.ts`
- Modify: `frontend/src/room/connection.ts`, `frontend/src/room/connection.test.ts`
- Modify: `frontend/src/components/App.tsx`

**Interfaces:**
- Consumes: Task 2's `Role`; Task 3's `describe('a role')`.
- Produces, for Task 5: `api.join(roomId: string, name: string, role: Role)` and `Connection.join(roomId: string, name: string, role: Role)`, with `App`'s `joinHere` passing `'Voter'`.

- [ ] **Step 1: Write the failing unit cases**

In `api.test.ts`, change `requests.join` to:

```ts
  join: () => join('brave-golden-otter', 'Alice', 'Facilitator'),
```

and replace the `describe('a role')` block with:

```ts
describe('a role', () => {
  it.each([
    ['join', requests.join, { name: 'Alice', role: 'Facilitator' }],
    ['switchRole', requests.switchRole, { role: 'Facilitator' }]
  ])('is sent in the body of %s', async (_, call, body) => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }))
    await call()
    expect(await fetchMock.mock.calls[0][0].json()).toEqual(body)
  })
})
```

In `connection.test.ts`, add `import type { Role } from '../protocol/snapshot'` after the `../protocol/api` import, change the `join` mock's type to `Mock<(roomId: string, name: string, role: Role) => Promise<JoinOutcome>>`, change each of the six `c.join('r', 'Alice')` to `c.join('r', 'Alice', 'Voter')`, and after "lets only the first join through, and opens the stream once it succeeds" insert:

```ts
  it('joins with the role it is given', async () => {
    await connect().join('r', 'Alice', 'Facilitator')
    expect(join).toHaveBeenCalledWith('r', 'Alice', 'Facilitator')
  })
```

Run: `npm run typecheck`
Expected: FAIL, `join` and `Connection.join` taking two arguments.

- [ ] **Step 2: Carry the role through `api` and `Connection`**

In `api.ts`, replace `join`'s head and request:

```ts
export async function join(roomId: string, name: string): Promise<JoinOutcome> {
  const { response } = await timed(signal =>
    client.POST('/rooms/{roomId}/join', {
      params: { path: { roomId } },
      // Every join is a voter's until the page offers roles (ui refresh step 2c).
      body: { name, role: 'Voter' },
      signal
    })
  )
```

with:

```ts
export async function join(roomId: string, name: string, role: Role): Promise<JoinOutcome> {
  const { response } = await timed(signal =>
    client.POST('/rooms/{roomId}/join', {
      params: { path: { roomId } },
      body: { name, role },
      signal
    })
  )
```

In `connection.ts`, replace `import { snapshotSchema, type RoomSnapshot } from '../protocol/snapshot'` with `import { snapshotSchema, type Role, type RoomSnapshot } from '../protocol/snapshot'`. In `ConnectionDeps`, make `join` `(roomId: string, name: string, role: Role) => Promise<JoinOutcome>`. In `Connection`, make it `join(roomId: string, name: string, role: Role): Promise<JoinResult>`. In the returned object, change `async join(id, name) {` to `async join(id, name, role) {` and `deps.join(id, name)` to `deps.join(id, name, role)`.

Run: `npm run typecheck`
Expected: the only error left is `App.tsx`'s two-argument `connection.join`, which Step 3 fixes.

- [ ] **Step 3: Pass `Voter` from `App`**

In `App.tsx`, replace the start of `joinHere`:

```tsx
    localStorage.setItem('name', name)
    void connection.join(pathRoom, name).then(result => {
```

with:

```tsx
    localStorage.setItem('name', name)
    // Every join is a voter's until the lobby offers a default role.
    void connection.join(pathRoom, name, 'Voter').then(result => {
```

- [ ] **Step 4: Run everything**

```bash
npm run typecheck && npm run lint && npm run test:unit
npm run e2e
```

Expected: clean; `Tests  114 passed (114)`, including the two new cases; `122 passed`, the e2e suite unchanged.

- [ ] **Step 5: Show the cases bite**

Apply each mutation alone, run `npm run test:unit`, then restore the file.

| Mutation | Fails |
| --- | --- |
| `api.ts`: `join` sends `role: 'Voter'` | "is sent in the body of join" |
| `connection.ts`: `deps.join(id, name, 'Voter')` | "joins with the role it is given" |

- [ ] **Step 6: Commit**

```bash
git add frontend/src/protocol/api.ts frontend/src/protocol/api.test.ts \
  frontend/src/room/connection.ts frontend/src/room/connection.test.ts frontend/src/components/App.tsx
git commit -m "refactor: carry the role through the join (ui refresh step 2c)" -m "api.join and Connection.join take the role, and App passes Voter, the role api.join hardcoded. The page joins as before; the join role, the remembered role else the lobby's default, replaces Voter next."
git status --short
```

Expected: `git status --short` prints nothing.

### Task 5: Join with the remembered role, else a default chosen in the lobby

**Files:**
- Create: `frontend/src/components/DefaultRole.tsx`
- Modify: `frontend/src/components/App.tsx`, `frontend/src/components/Lobby.tsx`, `frontend/src/components/Room.tsx`
- Modify: `e2e/fixtures.js`, `e2e/slug.spec.js`, `e2e/roles.spec.js`

**Interfaces:**
- Consumes: Task 2's whole module; Task 3's `ownRoleOf`, `api.switchRole`, `switchTo`, `facilitatorMark` and `e2e/roles.spec.js`; Task 4's three-argument `Connection.join` and `joinHere` passing `'Voter'`; Task 3's `RoleLine` wiring in `Room.tsx`.
- Produces: the `visitor` fixture, the `join` fixture's `{ role }` option, and the fixtures `defaultRoleChoice`, `defaultRoleRadio`, `defaultRoleLine` and `changeDefaultRole`.

- [ ] **Step 1: Add the default role control**

Create `frontend/src/components/DefaultRole.tsx`:

```tsx
import { useId } from 'react'
import type { Role } from '../protocol/snapshot'

type Props = {
  role: Role
  // The fieldset rather than the line: a first visit, or after Change.
  choosing: boolean
  disabled: boolean
  onChoose: (role: Role) => void
  onChange: () => void
}

const roles: Role[] = ['Voter', 'Facilitator']

export function DefaultRole({ role, choosing, disabled, onChoose, onChange }: Props) {
  const group = useId()
  if (!choosing)
    return (
      <div className="form-group row">
        <div className="col-sm-9 offset-sm-3 text-left">
          <span>{`Default role for new rooms: ${role}`}</span>{' '}
          <button
            type="button"
            className="btn btn-link p-0 align-baseline"
            disabled={disabled}
            onClick={onChange}
          >
            Change
          </button>
        </div>
      </div>
    )
  // The legend names the group only as the fieldset's first child, so no row div wraps it.
  return (
    <fieldset className="form-group row">
      <legend className="col-form-label col-sm-3 pt-0">Your default role</legend>
      <div className="col-sm-9 text-left">
        {roles.map(r => (
          <div className="form-check form-check-inline" key={r}>
            <input
              className="form-check-input"
              type="radio"
              name={group}
              id={`${group}-${r}`}
              checked={role === r}
              disabled={disabled}
              onChange={() => onChoose(r)}
            />
            <label className="form-check-label" htmlFor={`${group}-${r}`}>
              {r}
            </label>
          </div>
        ))}
        <small className="form-text text-muted">
          Used to join new rooms. You can change it here later.
        </small>
      </div>
    </fieldset>
  )
}
```

The legend must stay the fieldset's first child: Bootstrap's horizontal pattern wraps it in a `div.row`, which leaves the group with no accessible name, and every `getByRole('group', { name: 'Your default role' })` then times out.

In `Lobby.tsx`, add after the `react` import:

```tsx
import type { Role } from '../protocol/snapshot'
import { DefaultRole } from './DefaultRole'
```

Add to `Props`, after `onName`:

```tsx
  defaultRole: Role
  // From the default stored at load (decision 7), and only Change sets it again.
  choosingRole: boolean
  onChooseRole: (role: Role) => void
  onChangeRole: () => void
```

Add `defaultRole, choosingRole, onChooseRole, onChangeRole,` to the destructuring after `onName,`. Before `const nameRow`, insert:

```tsx
  const roleRow = (
    <DefaultRole
      role={defaultRole}
      choosing={choosingRole}
      disabled={disabled}
      onChoose={onChooseRole}
      onChange={onChangeRole}
    />
  )
```

and add `{roleRow}` on the line after `{nameRow(onCreate)}` and after `{nameRow(onJoin)}`, so it sits under the name in both forms.

- [ ] **Step 2: Wire storage in `App` and `Room`**

In `Room.tsx`, replace `import type { RoomSnapshot } from '../protocol/snapshot'` with `import type { Role, RoomSnapshot } from '../protocol/snapshot'`. Add to `Props`, after `onRefused`:

```tsx
  // A 204 from /role, which the page remembers before any snapshot shows it.
  onSwitched: (role: Role) => void
```

Add `onSwitched` to the destructured props, after `onRefused`, so the signature reads:

```tsx
export function Room({ roomId, snapshot, onCopied, onLeave, onRefused, onSwitched }: Props) {
```

Replace the role line's `onSwitch` with:

```tsx
                onSwitch={role => run(api.switchRole(roomId, role).then(() => onSwitched(role)))}
```

In `App.tsx`, add `import type { Role } from '../protocol/snapshot'` after the `../protocol/api` import, and after the `../room/connection` import:

```tsx
import {
  chooseDefault,
  forgetRole,
  joinRole,
  keepDefault,
  rememberRole,
  storedDefault
} from '../room/joinRole'
import { ownRoleOf } from '../room/view'
```

After the `if (movedOnLoad || restartedOnLoad)` line, insert:

```tsx
// Decision 7: the lobby's shape and the auto-join follow the default role stored at load.
const defaultOnLoad = storedDefault(localStorage)
```

After the `name` state, insert:

```tsx
  const [choosingRole, setChoosingRole] = useState(defaultOnLoad === null)
  const [shownRole, setShownRole] = useState<Role>(defaultOnLoad ?? 'Voter')
```

Replace the start of `joinHere`:

```tsx
    localStorage.setItem('name', name)
    // Every join is a voter's until the lobby offers a default role.
    void connection.join(pathRoom, name, 'Voter').then(result => {
```

with:

```tsx
    localStorage.setItem('name', name)
    const role = joinRole(localStorage, pathRoom, keepDefault(localStorage, shownRole))
    void connection.join(pathRoom, name, role).then(result => {
```

Replace `doCreate`'s first lines:

```tsx
    localStorage.setItem('name', name)
    api
      .createRoom()
      .then(goTo)
```

with:

```tsx
    localStorage.setItem('name', name)
    keepDefault(localStorage, shownRole)
    api
      .createRoom()
      .then(id => {
        forgetRole(localStorage, id)
        goTo(id)
      })
```

In `doJoin`, insert `keepDefault(localStorage, shownRole)` between `localStorage.setItem('name', name)` and `goTo(id)`.

Before the `reached` effect, insert:

```tsx
  const chooseRole = (role: Role) => {
    chooseDefault(localStorage, role)
    setShownRole(role)
  }

  // Read again, since another tab may have stored a choice after this page loaded.
  const changeRole = () => {
    setShownRole(storedDefault(localStorage) ?? shownRole)
    setChoosingRole(true)
  }

```

Replace the auto-join effect's comment and condition:

```tsx
  // A room's own path with a remembered name joins at once.
  useEffect(() => {
    if (pathRoom && name) joinHere()
```

with:

```tsx
  // Each snapshot's own seat, so a switch made in another tab is stored by every tab.
  useEffect(() => {
    const role = room.snapshot && ownRoleOf(room.snapshot)
    if (role) rememberRole(localStorage, pathRoom, role)
  }, [room.snapshot])

  // A room's own path joins at once with a remembered name and a default role (decision 7).
  useEffect(() => {
    if (pathRoom && name && defaultOnLoad !== null) joinHere()
```

Pass the new props to `Lobby`, after `onName={setName}`:

```tsx
          defaultRole={shownRole}
          choosingRole={choosingRole}
          onChooseRole={chooseRole}
          onChangeRole={changeRole}
```

and to `Room`, after `onRefused={() => connection.refused()}`:

```tsx
          onSwitched={role => rememberRole(localStorage, pathRoom, role)}
```

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: clean, and `Tests  114 passed (114)`.

- [ ] **Step 3: Extend the fixtures**

In `e2e/fixtures.js`, replace the `offOrigin` fixture's comment, `// Every context the suite opens goes through guard, here and in join, or a page could pass.`, with:

```js
  // Every context the suite opens goes through guard, here and in visitor, or a page could pass.
```

Replace the head of the `join` fixture, up to and including its `newPage()`:

```js
  // One browser context per participant: two pages in one context share the room cookie and
  // resolve to a single session, which is what newTab is for.
  join: async ({ browser, origin, room, stub, offOrigin }, use) => {
    const closers = []
    const join = async (name, { initScript } = {}) => {
      const context = await browser.newContext({ baseURL: origin })
      // Tracked before anything else can throw, so a half-built participant is still torn down.
      closers.push(() => context.close())
      await guard(context, offOrigin)
      if (initScript) await context.addInitScript(initScript)
      const page = await context.newPage()
```

with a `visitor` fixture that owns every participant context, and a `join` built on it:

```js
  // A page in its own guarded context, its localStorage seeded once, before its first goto.
  visitor: async ({ browser, origin, offOrigin }, use) => {
    const closers = []
    await use(async (storage = {}) => {
      const localStorage = Object.entries(storage).map(([name, value]) => ({ name, value }))
      const context = await browser.newContext({
        baseURL: origin,
        storageState: { cookies: [], origins: [{ origin, localStorage }] }
      })
      // Tracked before anything else can throw, so a half-built participant is still torn down.
      closers.push(() => context.close())
      await guard(context, offOrigin)
      return context.newPage()
    })
    // A case may have closed one already; context.close() is idempotent.
    for (const close of closers) await close().catch(() => {})
  },

  // One browser context per participant: two pages in one context share the room cookie and
  // resolve to a single session, which is what newTab is for.
  join: async ({ visitor, room, stub }, use) => {
    // Each case starts from a first visit, so the role is chosen as the default role.
    const join = async (name, { initScript, role = 'Voter' } = {}) => {
      const page = await visitor()
      const context = page.context()
      // Before the first goto, and context init scripts run on every navigation.
      if (initScript) await context.addInitScript(initScript)
```

and the end of the `join` fixture:

```js
    await use(join)
    // A case may have closed one already; context.close() is idempotent.
    for (const close of closers) await close().catch(() => {})
  },
```

with:

```js
    await use(join)
  },
```

Replace newTab's comment's second line, `// one participant. localStorage already holds the name, so the room's path joins at once.`, with:

```js
      // one participant. localStorage holds the name and the default role, so it joins at once.
```

Replace:

```js
      await nameInput(page).fill(name)
      await page.getByRole('button', { name: 'Join' }).click()
```

with:

```js
      await nameInput(page).fill(name)
      await defaultRoleRadio(page, role).check()
      await page.getByRole('button', { name: 'Join' }).click()
```

Before `// The role line's one button`, insert:

```js
// The lobby's default role: the fieldset on a first visit or after Change, else the line.
export const defaultRoleChoice = page => page.getByRole('group', { name: 'Your default role' })
export const defaultRoleRadio = (page, role) =>
  defaultRoleChoice(page).getByRole('radio', { name: role, exact: true })
export const defaultRoleLine = (page, role) =>
  page.getByText(`Default role for new rooms: ${role}`, { exact: true })
export const changeDefaultRole = page => page.getByRole('button', { name: 'Change' })

```

In `e2e/slug.spec.js`, replace the head of "a room remembered from before the cutover reopens under its derived name", up to and including its `goto`:

```js
test('a room remembered from before the cutover reopens under its derived name', async ({
  page,
  origin
}) => {
  // Seeded on / only: init scripts run on every navigation, and the rejoin rewrites the key.
  await page.addInitScript(legacy => {
    if (location.pathname === '/') {
      localStorage.setItem('roomId', legacy)
      localStorage.setItem('name', 'Alice')
    }
  }, crypto.randomUUID())
  await page.goto(`${origin}/`)
```

with:

```js
test('a room remembered from before the cutover reopens under its derived name', async ({
  visitor
}) => {
  // With a default role, so the rejoin joins at once rather than asking for one.
  const page = await visitor({ roomId: crypto.randomUUID(), name: 'Alice', defaultRole: 'Voter' })
  await page.goto('/')
```

- [ ] **Step 4: Write the lobby and storage cases**

In `e2e/roles.spec.js`, replace the import block and add two helpers, so the file starts as below. `joinedAs` reads the role from the switch button's name, the only role text in the contract.

```js
import {
  test,
  expect,
  card,
  changeDefaultRole,
  deck,
  defaultRoleChoice,
  defaultRoleLine,
  defaultRoleRadio,
  expectSummaryMatchesParticipants,
  facilitatorMark,
  frozenNotice,
  nameInput,
  ownEstimation,
  participantEntry,
  results,
  revealedEstimation,
  roomIdInput,
  switchTo,
  tallyEntries,
  unconfirmedCard,
  vote,
  votedMark
} from './fixtures.js'

const ROOM_URL = /\/[a-z]+-[a-z]+-[a-z]+$/
// In the room, with the role the join sent: each role line offers the other role.
const joinedAs = (page, role) =>
  expect(switchTo(page, role === 'Facilitator' ? 'voter' : 'facilitator')).toBeVisible()
```

followed by `becomeFacilitator` and Task 3's cases unchanged. Append at the end of the file:

```js

test('a facilitator stays one across a reload', async ({ join }) => {
  const alice = await join('Alice', { role: 'Facilitator' })
  const bob = await join('Bob')
  await expect(facilitatorMark(participantEntry(bob.page, 'Alice'))).toHaveCount(1)

  await alice.page.reload()
  await joinedAs(alice.page, 'Facilitator')
  await expect(deck(alice.page)).toHaveCount(0)
  await expect(facilitatorMark(participantEntry(bob.page, 'Alice'))).toHaveCount(1)
})

test('a regular user from before roles gets the lobby on Voter, and joins on Join', async ({
  visitor,
  room
}) => {
  const page = await visitor({ name: 'Alice' })
  const joins = []
  page.on('request', request => request.url().endsWith('/join') && joins.push(request.url()))
  await page.goto(`/${room}`)
  await expect(nameInput(page)).toHaveValue('Alice')
  await expect(defaultRoleRadio(page, 'Voter')).toBeChecked()
  // A page that joined on its own would have sent its join by now.
  await page.waitForLoadState('networkidle')
  expect(joins).toEqual([])

  await page.getByRole('button', { name: 'Join' }).click()
  await joinedAs(page, 'Voter')
})

test('a legacy link with no default role asks for one, joins with it, then joins at once', async ({
  visitor
}) => {
  const legacy = crypto.randomUUID()
  const page = await visitor({ name: 'Alice' })
  await page.goto(`/${legacy}`)
  await expect(page).toHaveURL(ROOM_URL)
  await defaultRoleRadio(page, 'Facilitator').check()
  await page.getByRole('button', { name: 'Join' }).click()
  await joinedAs(page, 'Facilitator')

  await page.goto(`/${legacy}`)
  await joinedAs(page, 'Facilitator')
})

test("with default Voter, a Join at the root takes the room's remembered Facilitator", async ({
  visitor,
  room
}) => {
  const page = await visitor({
    name: 'Alice',
    defaultRole: 'Voter',
    [`role:${room}`]: 'Facilitator'
  })
  await page.goto('/')
  await page.getByRole('link', { name: 'Join' }).click()
  await roomIdInput(page).fill(room)
  await page.getByRole('button', { name: 'Join' }).click()
  await joinedAs(page, 'Facilitator')
})

test("with default Voter, a legacy link takes its slug's remembered Facilitator", async ({
  visitor,
  request,
  origin
}) => {
  const legacy = crypto.randomUUID()
  // The derived slug, read off the redirect, since the key is the id the page loads.
  const redirect = await request.get(`${origin}/${legacy}`, { maxRedirects: 0 })
  const slug = new URL(redirect.headers().location, origin).pathname.slice(1)
  const page = await visitor({
    name: 'Alice',
    defaultRole: 'Voter',
    [`role:${slug}`]: 'Facilitator'
  })
  await page.goto(`/${legacy}`)
  await expect(page).toHaveURL(new RegExp(`/${slug}$`))
  await joinedAs(page, 'Facilitator')
})

test('a choice after Change is stored without a submit, and a new room takes it', async ({
  visitor
}) => {
  const page = await visitor({ name: 'Alice', defaultRole: 'Voter' })
  await page.goto('/')
  await expect(defaultRoleLine(page, 'Voter')).toBeVisible()
  await changeDefaultRole(page).click()
  await expect(defaultRoleRadio(page, 'Voter')).toBeChecked()
  await defaultRoleRadio(page, 'Facilitator').check()

  await page.reload()
  await expect(defaultRoleLine(page, 'Facilitator')).toBeVisible()
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(ROOM_URL)
  await joinedAs(page, 'Facilitator')
})

test('Change shows the default another tab stored after this page loaded', async ({ visitor }) => {
  const page = await visitor({ name: 'Alice', defaultRole: 'Voter' })
  await page.goto('/')
  await expect(defaultRoleLine(page, 'Voter')).toBeVisible()
  const other = await page.context().newPage()
  await other.goto('/')
  await changeDefaultRole(other).click()
  await defaultRoleRadio(other, 'Facilitator').check()

  await changeDefaultRole(page).click()
  await expect(defaultRoleRadio(page, 'Facilitator')).toBeChecked()
})

test("a revisit takes the role the room's snapshot stored, not a default changed since", async ({
  visitor,
  room
}) => {
  const page = await visitor({ name: 'Alice', defaultRole: 'Facilitator' })
  await page.goto(`/${room}`)
  await joinedAs(page, 'Facilitator')

  await page.goto('/')
  await changeDefaultRole(page).click()
  await defaultRoleRadio(page, 'Voter').check()
  await page.goto(`/${room}`)
  await joinedAs(page, 'Facilitator')
})

test('a malformed default role reaches the lobby, and a submit keeping Voter stores it', async ({
  visitor,
  room
}) => {
  const page = await visitor({ defaultRole: 'facilitator' })
  await page.goto(`/${room}`)
  await expect(defaultRoleRadio(page, 'Voter')).toBeChecked()
  await nameInput(page).fill('Alice')
  await page.getByRole('button', { name: 'Join' }).click()
  await joinedAs(page, 'Voter')

  await page.reload()
  await joinedAs(page, 'Voter')
})

test("a first-visit tab keeps its form, and another's submit keeps the choice it made", async ({
  visitor
}) => {
  const first = await visitor()
  const second = await first.context().newPage()
  await first.goto('/')
  await second.goto('/')
  await defaultRoleRadio(first, 'Facilitator').check()
  await expect(defaultRoleChoice(first)).toBeVisible()
  await expect(defaultRoleRadio(second, 'Voter')).toBeChecked()

  await nameInput(second).fill('Alice')
  await second.getByRole('button', { name: 'Create' }).click()
  await expect(second.getByRole('button', { name: 'Show votes' })).toBeVisible()
  const later = await first.context().newPage()
  await later.goto('/')
  await expect(defaultRoleLine(later, 'Facilitator')).toBeVisible()
})

test("Create forgets a reused slug's remembered role and joins with the default", async ({
  visitor,
  room
}) => {
  const page = await visitor({
    name: 'Alice',
    defaultRole: 'Facilitator',
    [`role:${room}`]: 'Voter'
  })
  // As if the server drew a slug this browser remembers from a room since forgotten.
  await page.route('**/create-room', route => route.fulfill({ status: 200, body: room }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(new RegExp(`/${room}$`))
  await joinedAs(page, 'Facilitator')
})

test('a switch survives a reload while the stream is frozen', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  await bob.freeze()
  const switched = bob.page.waitForResponse(r => r.url().endsWith('/role') && r.status() === 204)
  await switchTo(bob.page, 'facilitator').click()
  // A 204 has no body, so the page acts on it as the headers land.
  await switched
  await expect(facilitatorMark(participantEntry(alice.page, 'Bob'))).toHaveCount(1)
  // Frozen, so only the 204 told Bob's page.
  await expect(switchTo(bob.page, 'facilitator')).toBeVisible()

  await bob.page.reload()
  await joinedAs(bob.page, 'Facilitator')
  await expect(facilitatorMark(participantEntry(alice.page, 'Bob'))).toHaveCount(1)
})

test("a switch in one room changes neither another room's role nor the default", async ({
  visitor,
  room,
  app
}) => {
  const response = await fetch(`${app.baseUrl}/create-room`, { method: 'POST' })
  const other = (await response.text()).trim()
  const page = await visitor({ name: 'Alice', defaultRole: 'Voter' })
  await page.goto(`/${other}`)
  await joinedAs(page, 'Voter')

  await page.goto(`/${room}`)
  await switchTo(page, 'facilitator').click()
  await joinedAs(page, 'Facilitator')
  await page.reload()
  await joinedAs(page, 'Facilitator')

  // The default first: the other room's own snapshot would write over a stray write to it.
  await page.goto('/')
  await expect(defaultRoleLine(page, 'Voter')).toBeVisible()
  await page.goto(`/${other}`)
  await joinedAs(page, 'Voter')
})
```

Two traps found while verifying. Do not wait on `(await switched).finished()` in the frozen case: through the stub it never settles for this 204, and the case times out. And keep the last case's order: visiting the other room before checking the default lets that room's snapshot write `Voter` back over a stray write, so a `rememberRole` that also wrote the default would pass.

```bash
npx eslint e2e
npm run e2e -- e2e/roles.spec.js e2e/slug.spec.js e2e/lobby.spec.js
```

Expected: `54 passed`.

- [ ] **Step 5: Run everything**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm test
npm run e2e
```

Expected: clean; `Tests  114 passed (114)`; `pass 17`; `148 passed`.

- [ ] **Step 6: Show each writer and reader bites**

Apply each mutation alone, run `npm run e2e -- e2e/roles.spec.js e2e/slug.spec.js e2e/lobby.spec.js --project=chromium`, then restore the file.

| Mutation | Fails |
| --- | --- |
| `App.tsx`: the snapshot effect writes nothing (`void role`) | "a revisit takes the role the room's snapshot stored, not a default changed since" |
| `App.tsx`: `onSwitched={() => {}}` | "a switch survives a reload while the stream is frozen" |
| `App.tsx`: drop `forgetRole(localStorage, id)` | "Create forgets a reused slug's remembered role and joins with the default" |
| `App.tsx`: `chooseRole` also calls `setChoosingRole(false)` | six whose `check()` loses its radio as the form collapses: "a first-visit tab keeps its form, and another's submit keeps the choice it made", "a facilitator stays one across a reload", the legacy link with no default role, both Change cases and the revisit |
| `App.tsx`: `onChangeRole={() => setChoosingRole(true)}` | "Change shows the default another tab stored after this page loaded" |
| `App.tsx`: the auto-join tests `pathRoom && name` only | "a regular user from before roles gets the lobby on Voter, and joins on Join", and the legacy link with no default role |
| `App.tsx`: `joinHere` sends `keepDefault(localStorage, shownRole)`, skipping `joinRole` | "with default Voter, a Join at the root takes the room's remembered Facilitator", "with default Voter, a legacy link takes its slug's remembered Facilitator", the revisit, the frozen switch and "a switch in one room" (5) |
| `App.tsx`: `onSwitched` also calls `chooseDefault(localStorage, role)` | "a switch in one room changes neither another room's role nor the default" |
| `App.tsx`: `doCreate` calls `chooseDefault` in place of `keepDefault` | "a first-visit tab keeps its form, and another's submit keeps the choice it made" |
| `App.tsx`: `doCreate` drops `keepDefault` | `lobby.spec.js`'s "Enter in the name field creates a room" and "Create, Leave and Join change the address, and Leave keeps the name" |
| `App.tsx`: `doJoin` drops `keepDefault` | `lobby.spec.js`'s "a room name pasted with spaces into the Join form still joins" |
| `App.tsx`: `joinHere` takes `storedDefault(localStorage) ?? shownRole` in place of `keepDefault` | `lobby.spec.js`'s "the lobby offers the remembered room rather than joining it", the malformed default and the frozen switch (3) |

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/DefaultRole.tsx frontend/src/components/Lobby.tsx \
  frontend/src/components/App.tsx frontend/src/components/Room.tsx \
  e2e/fixtures.js e2e/slug.spec.js e2e/roles.spec.js
git commit -m "feat: join with the remembered role, else a default chosen in the lobby (ui refresh step 2c)" -m "Every join sends the room's remembered role, else the default role. The lobby asks for the default once, under the name, and a room's path joins at once only when a name and a default role are stored. Each snapshot and each 204 from /role stores the room's role, and Create forgets any role under the id it gets."
git status --short
```

Expected: `git status --short` prints nothing.

### Task 6: Mark step 2c landed

**Files:**
- Modify: `docs/superpowers/specs/2026-10-04-ui-refresh-2-roles-design.md`
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Check the step's scope**

```bash
git diff --stat 20260930.ui_refresh_2b_roles_wire HEAD -- src/main frontend/src/protocol/generated docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md
sbt -batch qa styleCheck
```

Expected: the first prints nothing; the second passes 353 tests.

- [ ] **Step 2: Update the status line and the roadmap**

In the roles spec, replace:

```
Status: Validated. Steps 2a and 2b landed; step 2c not yet implemented
```

with:

```
Status: Validated. Steps 2a, 2b and 2c landed
```

In `docs/roadmap.md`, replace:

```
- [ ] Roles: voting participant vs. observer, self-service switching, excluding
      observers from vote counts and status indicators. **Becomes step 2 of**
      `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`:
      product owners who facilitate and never vote keep auto-reveal from ever
      firing. It builds the non-voting role as that design's "facilitator", who
      keeps the controls, so there is no read-only observer.
```

with:

```
- [x] Roles: voting participant vs. observer, self-service switching, excluding
      observers from vote counts and status indicators. **Becomes step 2 of**
      `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`:
      product owners who facilitate and never vote keep auto-reveal from ever
      firing. It builds the non-voting role as that design's "facilitator", who
      keeps the controls, so there is no read-only observer. **Landed as steps
      2a to 2c** of `docs/superpowers/specs/2026-10-04-ui-refresh-2-roles-design.md`.
```

The item's text stays as written, as the other ticked items' does, and gains only the landing note.

```bash
git add docs/superpowers/specs/2026-10-04-ui-refresh-2-roles-design.md docs/roadmap.md
git commit -m "docs: mark ui refresh step 2c landed"
git status --short
```

Expected: `git status --short` prints nothing.
