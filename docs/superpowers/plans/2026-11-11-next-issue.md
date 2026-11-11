# Next Issue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once revealed, the round bar's Next issue opens a modal that sends one request clearing the round and setting the next issue; a page that finds the room moved on shows a neutral notice, in the dialog and in the issue editor.

**Architecture:** The room keeps a round number that only Next issue increments, carries it in the snapshot as `round`, and refuses a Next issue naming another round with `409`. The page keeps two pure matrices: the issue editor's, which gains its round, and a new one for the dialog. A shared `MovedOn` component draws the notice in both. `RoomPage` owns the dialog and the round bar's focus targets.

**Tech Stack:** Scala 3 + Pekko typed + tapir (ScalaTest); React 19 + TypeScript 5.9, Vitest, Playwright (Chromium and Firefox).

**Spec:** `docs/superpowers/specs/2026-11-09-next-issue-design.md`

## Global Constraints

- Endpoint: `POST /rooms/{roomId}/next-issue`, body `{ "round": <Int>, "issue": <String> }`; `204` applied, `409` `RoundClosed`, `401` `NoSession`, `403` `NotAMember`.
- `RoomState.roundNumber` starts at 1; only Next issue increments it; Clear does not reset it. Snapshot field: `round`.
- Copy, exactly: dialog title and field label "Next issue"; buttons "Next issue" and "Cancel"; the round bar's phone word "Next" with the name "Next issue"; notice `The room moved on to: "‹issue›"` or `The room moved on, with no issue yet`, then `OK`; message `Could not move on to the next issue`.
- Next issue is in the round bar only once revealed, after the toggle; the toggle is `button-secondary` there.
- The compact foot is below 65.75 rem, the phone layout below 51.75 rem (container `page`).
- Words first, icons beside them; no information only on hover.
- Comments: one or two lines each.
- Browser cases run through `npm run e2e`, whose `pree2e` builds and stages the app; `npx playwright test` tests a stale build.
- After any mutation is reverted, `npm run build` before a manual run.

## Rulings

The choices the spec left open, each with the simpler alternative.

1. **The refusal type.** `enum NextIssueRefusal: case RoundClosed` in `Room`, exported as `Room.RoundClosed`; `type NextIssueResult = CommandResult | NextIssueRefusal`. `Endpoints.status` and the bound of `errors[R <: …]` widen to the three refusal types. Reusing `VoteRefusal` is simpler but would add `409 RoundClosed` to `/vote`'s contract, which decision 1 forbids.
2. **The room's handling** mirrors `Vote`'s case: `RoomData.nextIssue(round, issue)` returns `(RoomData, Applied.type | NextIssueRefusal)` and the case publishes the result either way. Skipping the publish on a refusal saves one redundant snapshot, at the cost of a third shape of command case.
3. **`RoomState`** gains `roundNumber: Int` as its last field, without a default; the compiler finds `RoomState.empty` and `RoomDataFixtures.stateFor`. A default of 1 is simpler, but it would hide a site that forgets the number.
4. **Snapshot field order:** `round` after `votesRevealed`. Schema `z.number().int()`, required in both schemas: page and server ship together.
5. **The dialog's closes go through state.** `step` returns Closed for Cancel, OK and the awaited `204`; one layout effect calls `dialog.close()` when the state is Closed and the element open. Escape and a back gesture close the element first; its `close` event then dispatches `closed`, a no-op once Closed. The `close` event comes later than the close, so a press first settles one still due, and a `close` event that finds the element open again is ignored. The spec's matrix has the page close the element and the `close` event reach Closed; the outcome is the same, and a promise callback cannot read the current state without this. The simpler alternative, the hook calling `close()` from the answer, would close a dialog reopened after an Escape when the old request's `204` lands.
6. **Focus after a close** lives in the dialog's `close` handler, the one place every path reaches: `(nextRef.current ?? toggleRef.current)?.focus()`. `RoomPage` creates both refs and passes them to `RoundBar`.
7. **"Held focus before the replacement"** is React state, not a DOM read during render (the react-hooks lint forbids reading refs in render). `useFocusWithin()` returns `[within, handlers]`, `handlers` being `onFocus`/`onBlur` (blur clears it only when `relatedTarget` is outside); `IssuePanel` spreads it on its section, the dialog on its `<dialog>`. `MovedOn` captures its `focus` prop at mount (`useState(focus)`) and focuses its text in a layout effect. Reading `document.activeElement` is not enough: it cannot tell the editor's form from Next issue once both are gone.
8. **Next issue leaving while focused.** `RoundBar` tracks `nextHeld` with `onFocus`/`onBlur` on the button. In render, `if (!revealed && nextHeld)`, it clears `nextHeld` and bumps a `refocus` counter (the set-state-in-render pattern of `useRoundGuard`); a layout effect on `refocus` focuses the toggle. A plain "focus fell to the page" check is simpler but would also move a focus that was already on the page.
9. **Names.** The toggle gets `aria-label={revealed ? 'Re-vote' : 'Show votes'}`, since the compact foot hides a secondary button's word and lucide's icon is `aria-hidden`. Next issue gets `aria-label="Next issue"` and `data-do="next"`, its word `Next<span className="round-bar-tail"> issue</span>`, the tail `display: none` in the phone layout; `IssueEditor`'s Save ("Save issue", word "Save") is the precedent. Icon `ArrowRight`, as the mockup's.
10. **Shared press and key rules.** `IssuePanel`'s three capture handlers move to `components/pressRules.ts` as `export const pressRules = { onMouseDownCapture, onClickCapture, onKeyDownCapture }`, spread by `IssuePanel` and the dialog. `IssueEditor`'s drop logic moves to `components/fieldKey.ts` as `fieldKey(e: KeyboardEvent): 'Enter' | 'Escape' | null` (repeat and composition give `null`). Both moves change no behaviour, so the existing cases judge them. Copying the handlers is simpler, but two copies of the double-click rule can drift.
11. **The dialog's state and component.** `room/nextIssue.ts` holds the matrix (Task 3); `components/useNextIssue.ts` wires it, called in `RoomPage`; `components/NextIssueDialog.tsx` renders it. The dialog does not reuse `IssueEditor` (other labels, no Escape handling), only its classes.
12. **The dialog's CSS** (`next-issue-dialog.css`): class `panel next-dialog`, `width: min(36rem, 100% - 2 * var(--space-4))`, `h2` as the mockup's. The `margin-block: 0` rules, `.next-dialog .issue-editor > .issue-editor-field` (outranking `issue-editor.css`'s rule rather than relying on bundle order) and `.next-dialog .issue-editor-actions`, sit inside `@container page (width >= 65.75rem)`, so they never outrank the compact `margin-top`. The backdrop takes a new decorative token, `--scrim-colour: rgba(28, 25, 23, 0.45)`, in `colours.css`, since the gate keeps colour literals out of component CSS.
13. **The notice's text** is `movedOnText(issue: string): string` in `room/nextIssue.ts`, used by `MovedOn`; the focus target is a `<span tabIndex={-1}>` around it inside `Message`, so `Message` is unchanged.
14. **Layout widths.** 320 px is the viewport, as the other 320 cases, and the case asserts the container's width there too. 51.75 rem (828 px) and 65.75 rem (1052 px) are the `.room-page` container's width: read the gutter once (viewport minus container), `setViewportSize` to target plus gutter, assert the container's width, height 600.
15. **The browser checks** are throwaway Playwright probes at Task 4's start, not committed; their answers go in this plan's "Browser checks" note. If Escape closes the dialog during a composition, stop and bring it to the user: guarding it adds a rule the spec does not have.
16. **README** follows the endpoint in Task 1: the table row, `/next-issue`'s `409` beside `/vote`'s, `round` in the JSON example and its sentence, and "next-issue" in the membership-check list.
17. **Delivery.** One PR from `20261109.next-issue` holding the spec, this plan, the code and README, linking #548.

## Review Focus

1. **A long shown issue at 320 px.** `ISSUE_240` pre-filled grows the field (`field-sizing: content`); the buttons must stay reachable, the dialog scrolling rather than clipping. Test: Task 5, the 320 px case.
2. **A multi-line issue pre-filled** (one set through the API). The field is one line. Test: Task 3, `pressed` with `"a\nb"` gives the draft `"a b"`.
3. **A facilitator moves on.** Anyone in the room may. Test: Task 4, the other page in the notice case is a facilitator.
4. **Reopening after a failure** starts fresh: the shown issue again, no message. Test: Task 3, `pressed` after a failed submit and a close.
5. **The issue edited by someone while the dialog is open**, same round: no notice, the field keeps what was typed. Test: Task 4, in the notice case before the move on.

---

### Task 1: The round number and the endpoint

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`, `actors/RoomManager.scala`, `actors/RoomSnapshot.scala`, `Endpoints.scala`, `Requests.scala`, `API.scala`
- Modify: `README.md`; regenerate `frontend/src/protocol/generated/openapi.json` and `openapi.d.ts`
- Modify: `frontend/src/protocol/snapshot.ts`, `frontend/src/protocol/api.ts`, `frontend/src/room/view.ts`
- Test: `RoomSpec.scala`, `RoomSnapshotSpec.scala`, `APISpec.scala`, `RoomManagerSpec.scala`, `RoomDataFixtures.scala`, `frontend/src/protocol/api.test.ts`, `frontend/src/room/view.test.ts`

**Interfaces:**
- Produces (server): `Room.NextIssue(token: SessionToken, round: Int, issue: String, replyTo: ActorRef[NextIssueResult])`; `RoomManager.NextIssue(roomId: Slug, token: Option[Room.SessionToken], round: Int, issue: String, replyTo: ActorRef[Room.NextIssueResult])`; `NextIssueRequest(round: Int, issue: String)`; `Endpoints.nextIssue`; fixture `withRoundNumber(n: Int)`.
- Produces (page): `RoomSnapshot['round']: number`; `View.round: number`; `api.nextIssue(roomId: string, round: number, issue: string): Promise<void>`, rejecting with `ApiError('next-issue', status)`.

- [ ] **Step 1: Write the failing server tests**
  - `RoomSpec`, "move on to the next issue in one snapshot": two voted users, `withRevealed()`; send `NextIssue(user.token, 1, "PP-2", inbox)`. Each probe's next snapshot has `currentIssue == "PP-2"`, `votesRevealed == false`, `round == 2`, every `hasEstimation == false`; the inbox got `Applied`; `GetData` shows `roundNumber == 2` and the seats cleared.
  - `RoomSpec`, "refuse a next issue behind or ahead of the room's round": `withRoundNumber(2)`; rounds 1 and 3 each answer `RoundClosed`, and `GetData` equals the data before.
  - `RoomSpec`, "move on from a voting round, and re-arm the auto-reveal": one user voted, round open; `NextIssue` round 1 answers `Applied`; then both users vote and the round reveals.
  - `RoomSpec`, "keep the round number through a clear": `withRoundNumber(2)`, `ClearVotes`, `GetData` shows `roundNumber == 2`.
  - `RoomSpec`, the memberless-session case's `assertUnaffected` list gains `Room.NextIssue(minted.token, 1, "a different issue", TestInbox[Room.NextIssueResult]().ref)`, and the case's comment "any of the five honoured wrongly" loses its count.
  - `RoomSnapshotSpec`, "carry the room's round number": `withRoundNumber(3)` gives `round == 3`.
  - `RoomManagerSpec`, relay case as `EditIssue`'s: the room receives `Room.NextIssue(token, 4, "issue name", reply)`.
  - `APISpec`: a `nextIssueReply` beside `voteReply`, answered by the fake manager. "dispatch a next-issue command" (`NextIssueRequest(4, "PP-2")` reaches the manager with roomId, token, 4, "PP-2", answers `204`); "answer 409 for a next issue on a closed round"; "answer 401 and 403 for a next issue"; each drains the dispatched message as the vote cases do.
- [ ] **Step 2: Run them, expect compile errors on the missing names**

Run: `sbt test` — Expected: compilation fails on `NextIssue`, `roundNumber`, `withRoundNumber`.

- [ ] **Step 3: Implement** the names above (rulings 1 to 4). `RoomData.nextIssue` refuses unless `round == state.roundNumber`; applying is `clear()` then `currentIssue = issue` and `roundNumber + 1` in one `copy`. The endpoint is `endpoint.post.in(roomPath / "next-issue").in(sessionIn).in(jsonBody[NextIssueRequest]).out(statusCode(StatusCode.NoContent)).errorOut(nextIssueErrors)` with `nextIssueErrors = errors(Room.Refusal.values.toSeq ++ Room.NextIssueRefusal.values)`, added to `all`; `API` answers through an `answerNextIssue` shaped as `answerVote`.
- [ ] **Step 4: Run the server suite**

Run: `sbt test styleCheck` — Expected: all pass; `target/contract/*.json` now carry `"round"`.

- [ ] **Step 5: Prove two tests can fail.** Make `clear()` reset `roundNumber` to 1: "keep the round number through a clear" goes red. Make `nextIssue` accept any round: the refusal case goes red. Revert both.
- [ ] **Step 6: Regenerate the protocol and wire the page.** `sbt genOpenApi && npm run gen:api`. Add `round: z.number().int()` to `build` in `snapshot.ts` (after `votesRevealed`), `round: s.round` to `View` and `applySnapshot`, and `api.nextIssue` shaped as `editIssue`. Tests: `api.test.ts` "next-issue posts the round and the issue" in the file's existing style; `view.test.ts` fixtures gain `round`, one row asserting `view.round`.
- [ ] **Step 7: Run the page checks**

Run: `npm run typecheck && npm run lint && npm run test:unit` — Expected: pass, including the snapshot contract against the regenerated `target/contract`.

- [ ] **Step 8: README** per ruling 16.
- [ ] **Step 9: Commit** `feat: add the next-issue endpoint and the room's round number`

### Task 2: The issue editor belongs to its round

**Files:**
- Create: `frontend/src/components/MovedOn.tsx`, `frontend/src/components/useFocusWithin.ts`, `frontend/src/components/pressRules.ts`, `frontend/src/components/fieldKey.ts`, `frontend/src/room/nextIssue.ts` (only `movedOnText` here), `frontend/src/room/nextIssue.test.ts`
- Modify: `frontend/src/room/issueEditor.ts`, `useIssueEditor.ts`, `IssuePanel.tsx`, `IssueEditor.tsx`, `RoomPage.tsx` (passes `round`)
- Test: `frontend/src/room/issueEditor.test.ts`, `e2e/next.spec.js` (new)

**Interfaces:**
- Consumes: `View.round` (Task 1).
- Produces: `movedOnText(issue: string): string`; `MovedOn({ issue, focus, onOk }: { issue: string; focus: boolean; onOk: () => void })`; `useFocusWithin(): [boolean, { onFocus: FocusEventHandler; onBlur: FocusEventHandler }]`; `pressRules`; `fieldKey(e: KeyboardEvent): 'Enter' | 'Escape' | null`; `EditorState` gains `round: number` and `opening: number`; `initial(issue: string, round: number)`; snapshot event `{ type: 'snapshot'; issue: string; round: number }`; `EditorView` gains `movedOn: boolean`; `useIssueEditor(issue, round, save)`; `IssuePanel` prop `round: number`.

- [ ] **Step 1: Write the failing unit tests.** `nextIssue.test.ts`: `movedOnText('PP-2')` is `The room moved on to: "PP-2"`; `movedOnText('')` is `The room moved on, with no issue yet`. `issueEditor.test.ts`, with snapshots carrying `round`:
  - editing, a snapshot of round 2 with a new issue: `shows` gives `movedOn: true`, `notice: null`, `failed: false`;
  - the same with the issue unchanged: `movedOn: true`;
  - editing after a failed save, then a round-2 snapshot: `movedOn: true`, `failed: false`;
  - saving, a round-2 snapshot: `mode: 'saving'`, `movedOn: false`; then `failed` gives `movedOn: true`;
  - saved text waiting, a round-2 snapshot: `saved` is `null`;
  - saving, a round-2 snapshot, then `succeeded`: `mode: 'viewing'`, `saved` is `null`;
  - within a round, the existing conflict rows unchanged (`movedOn: false`).
- [ ] **Step 2: Run them, expect failures** — `npm run test:unit` — Expected: FAIL on the missing export and the new fields.
- [ ] **Step 3: Implement the matrix.** `snapshot`: store the round, and `saved` is `null` when the round changed, else as today. `pencil`: `opening: s.round`. `succeeded`: `saved` is the draft only when `s.store === s.before && s.round === s.opening`. `shows`: `movedOn = s.mode === 'editing' && s.round !== s.opening`; when moved on, `notice: null, failed: false`.
- [ ] **Step 4: Run the unit tests** — Expected: PASS.
- [ ] **Step 5: Extract `pressRules` and `fieldKey`** (ruling 10) and run `npm run e2e -- e2e/room.spec.js -g "issue|Enter|Save|double"` — Expected: PASS unchanged.
- [ ] **Step 6: Write the failing e2e case** in `e2e/next.spec.js`, locators scoped to `issuePanel(page)`: "an open issue editor shows the notice once the room moves on, and OK puts focus on Edit". Alice opens Edit and types `mine`; Bob reveals and posts `next-issue` through `page.request` with round 1 and `PP-2`; in Alice's issue panel the status reads `The room moved on to: "PP-2"`, the field is gone, focus is on the notice's text; `OK` closes it, `issueText` reads `PP-2`, focus on `issueEdit`.
- [ ] **Step 7: Wire it.** `useIssueEditor` starts with `useReducer(step, { issue, round }, ({ issue, round }) => initial(issue, round))` and folds `round` with `issue`. `IssuePanel` spreads `useFocusWithin`'s handlers on its section; when `editor.movedOn` it renders no `IssueEditor`, and its status region holds `<MovedOn issue={issue} focus={within} onOk={editor.cancel} />` instead of the failure and conflict lines.
- [ ] **Step 8: Run** `npm run e2e -- e2e/next.spec.js e2e/room.spec.js` — Expected: PASS in both browsers.
- [ ] **Step 9: Prove the e2e case can fail.** Make `MovedOn` ignore `focus`: red on the focus assertion. Revert, `npm run build`.
- [ ] **Step 10: Commit** `feat: show the issue editor's notice once the room moves on`

### Task 3: The dialog's matrix

**Files:**
- Modify: `frontend/src/room/nextIssue.ts`
- Test: `frontend/src/room/nextIssue.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type NextState =
    | { mode: 'closed' }
    | { mode: 'open'; opening: number; draft: string; failed: boolean }
    | { mode: 'sending'; opening: number; draft: string; awaiting: number }
  export type NextEvent =
    | { type: 'pressed'; issue: string; round: number }
    | { type: 'typed'; text: string }
    | { type: 'submit'; request: number }
    | { type: 'cancel' } // Cancel or OK
    | { type: 'closed' } // the element's close event
    | { type: 'answered'; request: number; ok: boolean }
  export const closed: NextState
  export function step(s: NextState, e: NextEvent): NextState
  export function shows(s: NextState, round: number): { mode: NextState['mode']; draft: string; failed: boolean; movedOn: boolean }
  ```

- [ ] **Step 1: Write the failing tests,** one per cell that changes state, plus:
  - `pressed` from closed: open, `draft` is `oneLine(issue)` (`"a\nb"` gives `"a b"`), `opening` the round, `failed: false`; `pressed` from open or sending: unchanged;
  - `typed` in open: draft one-lined; in sending: unchanged;
  - `submit` in open: sending, `awaiting` the request, message cleared; in sending: unchanged;
  - `cancel` in open: closed; in sending: unchanged;
  - `closed` from open and from sending: closed;
  - `answered` ok to the awaited request: closed; not ok: open with `failed: true` and the draft kept; an answer to another request, in each state: unchanged;
  - an earlier request's answer after closing and reopening: unchanged (open);
  - reopening after a failed answer and a close: `failed: false`, the new shown issue;
  - `shows(open, opening + 1)`: `movedOn: true`, `failed: false`; `shows(sending, opening + 1)`: `movedOn: false`.
- [ ] **Step 2: Run** `npm run test:unit` — Expected: FAIL, `step` is not exported.
- [ ] **Step 3: Implement** `step` and `shows`; every event outside its state returns `s`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: add the next issue dialog's states and events`

### Task 4: The dialog and the round bar

**Files:**
- Create: `frontend/src/components/useNextIssue.ts`, `NextIssueDialog.tsx`, `next-issue-dialog.css`
- Modify: `RoundBar.tsx`, `round-bar.css`, `RoomPage.tsx`, `frontend/src/colours.css`
- Test: `e2e/next.spec.js`, `e2e/fixtures.js` (dialog locators), `e2e/layout.spec.js` (the phase-line case)

**Interfaces:**
- Consumes: Task 1's `api.nextIssue`, `View.round`; Task 2's `MovedOn`, `useFocusWithin`, `pressRules`, `fieldKey`; Task 3's `step`, `shows`, `closed`.
- Produces: `useNextIssue(issue: string, round: number, send: (round: number, issue: string) => Promise<void>)` returning `shows`' view plus `dialogRef`, `fieldRef`, `open()`, `type(text)`, `submit()`, `cancel()`, `onClose()`, `onCancelEvent(e)`; `NextIssueDialog({ next, issue, onClosed })`; `RoundBar` props gain `onNext: () => void`, `nextRef`, `toggleRef` (`RefObject<HTMLButtonElement | null>`).

- [ ] **Step 1: Run the browser checks** (ruling 15) on a throwaway page with a `<dialog>` whose `cancel` is prevented, both browsers: one Escape keeps it open; a repeated one closes it; a mousedown on the backdrop with `preventDefault` leaves focus in the field; in Chromium, `Input.imeSetComposition` through CDP then Escape. The composition probe is Chromium only (CDP), so Firefox stays unchecked. Record the answers in a "Browser checks" note under this task; stop on a surprise.

  **Browser checks** (2026-11-11, Playwright's Chromium 156 and Firefox 157):
  - With `cancel` prevented, both browsers need three Escapes, not two: the first two `cancel` events are cancelable, the third is not and closes. Same after opening by click or Enter and submitting by Enter or click.
  - A prevented mousedown on the backdrop or the dialog's padding leaves focus in the field, in both.
  - Chromium: after `Input.imeSetComposition`, Playwright's Escape (key 27, `isComposing` false) drops the composition and closes the dialog; an IME-style Escape (`Process`, keyCode 229, `isComposing` true) keeps both.
  - Ruled with the user: the composition close is a probe artefact (an input method delivers Escape as keyCode 229), so no guard; the 401 case repeats Escape until the dialog closes.
- [ ] **Step 2: Write the failing e2e cases** in `e2e/next.spec.js`, locators scoped to `page.getByRole('dialog', { name: 'Next issue' })`:
  - "Next issue moves the room on": absent while voting, present once revealed, `aria-disabled="true"` just after the reveal and without it once the guard ends, which every case waits out before pressing it (the bar drops a guarded click); open: field `PP-1` selected (`selectionStart` 0, `selectionEnd` 4) and focused; type `PP-2`, Enter; both pages show `PP-2`, Voting, no votes; focus on Show votes. A second run with the `204` held (`page.route`, `route.fetch()`, release later): the form stays, never the notice, until released; a second Enter and a click on the dialog's Next issue meanwhile leave the route's request count at 1.
  - "Cancel and Escape change nothing": each closes, the issue and votes unchanged, focus on Next issue; with the request held, one Escape leaves the dialog open, read-only, buttons `aria-disabled`.
  - "a held Enter or a double-click on Next issue submits nothing": `keyboard.down('Enter')` with repeats, and `dblclick`; the dialog is open, the round still revealed, and after the double-click focus is in the field.
  - "a page that finds the room moved on shows the notice": Bob joins as a facilitator. Alice opens the dialog and types `mine`; Bob edits the issue to `PP-1b`: Alice's field still reads `mine`, no notice. Bob posts `next-issue` with the issue unchanged; Alice's dialog reads `The room moved on to: "PP-1b"`, focus on its text; OK closes it, focus on Show votes.
  - "a failed move keeps the text and says so": route aborted; `Could not move on to the next issue`, field `mine`.
  - "a 401 after the dialog closed reaches the restart notice": route held, Escape repeated until the dialog closes (at most three), then `route.fulfill({ status: 401 })`; `restartNotice` visible.
  - "focus on Next issue moves to the toggle when the room moves on": Alice has an issue editor open and focus on Next issue; Bob moves on; focus on Show votes, not on the editor's notice.
- [ ] **Step 3: Run them** — `npm run e2e -- e2e/next.spec.js` — Expected: FAIL, no Next issue button.
- [ ] **Step 4: Implement the round bar** (rulings 8, 9): Next issue after the toggle when revealed, `button button-primary`, `ArrowRight`, `ref={nextRef}`, `aria-disabled={guarded || undefined}` as its neighbours; the toggle `button-secondary` when revealed, `ref={toggleRef}`; `.round-bar-tail { display: none }` under `@container page (width < 51.75rem)`.
- [ ] **Step 5: Implement the hook and the dialog** (rulings 5, 6, 7, 11, 12, 13). `open()`: `flushSync` the `pressed` event, `showModal()`, focus and `select()` the field, all in the press's handler. `submit()` returns unless the state is open, as `useIssueEditor.submit` does; then it takes `++counter.current` and calls `send(opening, draft)`, answering `answered`. The `<dialog aria-labelledby>` spreads `pressRules` and the focus handlers; `onMouseDown` prevents default when `e.target === e.currentTarget`; `onCancel` prevents default while sending; `onClose` dispatches `closed` and calls `onClosed`. The form: `<label>` "Next issue", the `issue-editor-field` textarea (`rows={1}`, `enterKeyHint="done"`, `readOnly` while sending, `fieldKey` Enter submits), then `issue-editor-actions` with Next issue (`ArrowRight`) and Cancel (`X`), both `aria-disabled` while sending. Once moved on, the form (field and buttons) is not rendered; the always-present `role="status"` region holds the message or `MovedOn`. `RoomPage` renders it inside `.room-page`, outside `RoundBar`, with `send` built as `saveIssue` is, and `keepClearOfSheet` returns early for a target inside `dialog`.
- [ ] **Step 6: Change** "the phase line keeps its box through a reveal, a Re-vote and a vote" in `e2e/layout.spec.js`: the revealed comparison passes `['x', 'y', 'height']` to `moved`, since Next issue narrows the phase line; after Re-vote and after a vote, all four fields as today.
- [ ] **Step 7: Run** `npm run e2e -- e2e/next.spec.js e2e/room.spec.js e2e/phone.spec.js e2e/narrow.spec.js e2e/layout.spec.js` — Expected: PASS in both browsers.
- [ ] **Step 8: Prove four cases can fail**, one at a time, reverting and rebuilding after each: make `shows` report `movedOn` for a changed round while sending (the held-`204` run shows the notice; Task 3's earlier-answer test already pins `awaiting`); drop the `onCancel` guard (the Escape-while-sending check); drop ruling 8's refocus (the toggle focus case); drop `submit()`'s state guard (the request count).
- [ ] **Step 9: Run** `npm run typecheck && npm run lint && npm run test:unit && npm run e2e` — Expected: PASS, the whole browser suite included (the toggle's class and name change under `roles`, `voters` and `progress` too), the gate reaching `--scrim-colour` as decorative.
- [ ] **Step 10: Commit** `feat: add Next issue to the round bar, in a modal dialog`

### Task 5: Layout

**Files:**
- Modify: `e2e/layout.spec.js`

- [ ] **Step 1: Add, in "the narrow layouts"** (Chromium only, ruling 14): "once revealed, each round bar button holds one line" at 320 by 600, at a container of 51.75 rem and of 65.75 rem, each button's text one line by the range-rects count the avatar case uses; at 320 and at 51.75 rem minus one pixel Next issue reads `Next` (`toHaveText('Next', { useInnerText: true })`, since `textContent` keeps " issue"). At 320 by 640 with `ISSUE_240`, open the dialog: the dialog's box lies within the viewport and `scrollIntoViewIfNeeded` makes the Next issue button visible.
- [ ] **Step 2: Run** `npm run e2e -- e2e/layout.spec.js` — Expected: PASS. A width that does not fit goes back to the spec (decision 4), not into CSS here.
- [ ] **Step 3: Prove it can fail.** Remove the `.round-bar-tail` rule: the phone-word check goes red. Revert, `npm run build`.
- [ ] **Step 4: Commit** `test: check the round bar's fit with Next issue`

### Task 6: Hand check and PR

- [ ] **Step 1:** Re-check every citation in the files this branch changed (CLAUDE.md lessons).
- [ ] **Step 2:** Draft the iPhone hand check (the keyboard opens with the field selected) as a phone-risk issue or an append to one; show the text to the user before filing.
- [ ] **Step 3:** Run the whole suite: `sbt test styleCheck && npm run typecheck && npm run lint && npm run test:unit && npm run e2e` — Expected: PASS.
- [ ] **Step 4:** Open the PR, linking #548, after the final review.
