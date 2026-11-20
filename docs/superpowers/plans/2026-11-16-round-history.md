# Round History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next issue records the round's outcome (an estimate, Unsettled, or nothing for Skip) with the issue being left, and the room shows those entries in a round history panel.

**Architecture:** The room keeps `history`, appended in Next issue's one state change, and the snapshot carries it whole. The Next issue dialog gains an estimate row whose choice its matrix holds and its request sends. A `RoundHistory` panel draws the entries at the sidebar's top on desktop and between the issue and the table on the phone, kept scrolled to its end.

**Tech Stack:** Scala 3 + Pekko typed + tapir + circe (ScalaTest); React 19 + TypeScript 5.9, Vitest, Playwright (Chromium and Firefox).

**Spec:** `docs/superpowers/specs/2026-11-16-round-history-design.md`

## Global Constraints

- Request: `POST /rooms/{roomId}/next-issue`, body `{ "round", "issue", "outcome" }`, `outcome` one of `{ "type": "Estimate", "value": "8" }`, `{ "type": "Unsettled" }`, `{ "type": "Skip" }`; an unknown type or a blank `value` answers `400`. The server does not check the value against a deck.
- Snapshot: `history: [{ "issue", "outcome" }]`, oldest first, `outcome` `{ "type": "Estimate", "value" }` or `{ "type": "Unsettled" }`; required in both page schemas.
- An entry holds the room's issue when it was recorded, the one being left, never the request's.
- Copy, exactly: legend `Estimate for ‹short form›`; radios the deck values, then `Unsettled`, `Skip`; message `Choose an estimate, Unsettled or Skip`; panel label `Rounds · ‹entries›`; button `Show more` / `Show less`; an empty issue's short form `Round ‹position›`; a row's outcome the value, or `Unsettled`.
- Desktop list up to 5 rows tall, the opened phone list up to 3, both growing with the entries; the phone layout is below 51.75 rem (container `page`).
- No `title` on a row; words first, icons beside them; no information only on hover.
- Comments: one or two lines each.
- Browser cases run through `npm run e2e` (`pree2e` builds and stages the app); after a reverted mutation, `npm run build`.

## Rulings

The choices the spec left open, each with the simpler alternative.

1. **Server types.** `Room.Outcome` is `enum Outcome: case Estimate(value: String); case Unsettled`, `Room.Entry(issue: String, outcome: Outcome)`. The wire's choice is `enum Choice: case Estimate(value: String); case Unsettled; case Skip` in `Requests.scala`, with `def recorded: Option[Room.Outcome]` (Skip is `None`); `Room.NextIssue` and `RoomManager.NextIssue` take `outcome: Option[Room.Outcome]` after `issue`. One enum holding Skip in `Room` is simpler, but an entry could then hold Skip, which the spec says is no outcome.
2. **The choice's codecs.** Hand-written circe `Decoder` and `Encoder` on `type`, tags spelt out as `RoomSnapshot.Estimation`'s; any other type fails as "not an outcome". tapir: `Schema.derived[Choice]` under `Configuration.default.withDiscriminator("type")`, then `.validate(Validator.custom(...))` refusing a blank `Estimate` value with "an estimate needs a value", as `VoteRequest`. A derived circe codec is simpler but wraps each case in an object named by it, not the snapshot's tagging.
3. **The snapshot's entries.** `RoomSnapshot` gains `history: List[Room.Entry]` after `round`; `given Encoder[Room.Outcome]` (through `tagged`) and `given Encoder[Room.Entry]` live in `RoomSnapshot`. No projection type: an entry holds nothing private, unlike `Member`.
4. **`RoomState`** gains `history: Vector[Room.Entry]` as its last field, without a default, as the Next issue plan's ruling 3 did for `roundNumber`; fixture `withHistory(entries: Room.Entry*)`.
5. **Applying.** `RoomData.nextIssue(round, issue, outcome)` appends `Entry(this.state.currentIssue, o)` for `Some(o)` in the same `copy` that replaces the issue.
6. **Task 1 sends Skip.** `RoomPage`'s send passes `{ type: 'Skip' }` until Task 3 wires the estimate row, so the existing suite judges Task 1. Server and dialog in one task are simpler to sequence but too big for one review gate.
7. **Page types.** `Choice` (`{ type: 'Estimate'; value: string } | { type: 'Unsettled' } | { type: 'Skip' }`) and `sameChoice(a, b)` live in `room/nextIssue.ts`; `Entry = RoomSnapshot['history'][number]`; `View.history: Entry[]`. The typed client checks `api.nextIssue`'s body against the generated schema, so no hand check of `openapi.d.ts`.
8. **Pre-selection** is `preselected(deck: readonly string[], revealed: boolean, summary: [string, number][]): Choice | null` in `room/nextIssue.ts`: an `Estimate` of `resultHeadline(deck, summary).tied[0]` when revealed, `tied` has one element and it is on the deck; else `null`. `RoomPage` computes it in the press: `next.open(preselected(estimationValues, view.votesRevealed, view.votesSummary))`. Passing the view into `useNextIssue` is simpler but ties the hook to the deck.
9. **The matrix.** Open gains `choice: Choice | null` and `missing: boolean`; Sending gains `choice: Choice`. `pressed` gains `checked: Choice | null`; a new event `{ type: 'chose'; choice: Choice }` sets the choice and clears `missing` in Open, and is ignored elsewhere. `submit` in Open with no choice gives Open with `missing: true`; with one, Sending as today. A failed answer keeps the choice. `shows` adds `choice` and `missing`, `missing` false once moved on as `failed` is. The hook's `submit()` focuses the first radio after dispatching when the choice is `null`.
10. **The radios.** A `<fieldset className="next-estimate">` with `<legend>Estimate for <bdi>{short.text}</bdi></legend>`; each chip a `<label className="next-chip">` wrapping a `visually-hidden` `<input type="radio" name={useId()}>` and its `Figure` or word, controlled by `checked`; `:has(:checked)` and `:has(:focus-visible)` draw the mockup's checked chip and the focus ring. While sending each radio is `aria-disabled` and `chose` is ignored. A `disabled` fieldset is simpler but drops a focused radio's focus to the page. The missing-choice message is a `<Message tone="problem">` in the dialog's status region, as the failure.
11. **The short form** is `shortForm(issue: string, position: number): Short`, `Short = { kind: 'link' | 'text'; text: string }`, in `room/history.ts`. Link: the trimmed issue matches `/^https?:\/\/\S+$/i`; cut at the first `?` or `#`. Text: whitespace runs collapsed to one space. Empty after trimming: `Round ‹position›`, kind text.
12. **The panel** is `components/RoundHistory.tsx` with `round-history.css`: `<section className="panel round-history" aria-labelledby={label}>`, a head line holding `<h2 className="panel-label" id={label}>` and, from two entries, the toggle; then `<ol tabIndex={0} aria-labelledby={label}>`, its rows `<li>` with the issue cell then `<span className="round-history-outcome"><Figure …/></span>` or `Unsettled`. A link cell is `<span className="round-history-issue round-history-link"><bdi dir="ltr">…</bdi></span>`; a text cell `<span className="round-history-issue" dir="auto">`. `role="region"` on the list is simpler to say but loses the list's item count.
13. **Staying at the end** is `useStickToEnd(ref: RefObject<HTMLElement | null>, count: number)` in `components/useStickToEnd.ts`: a layout effect on `count` and a `ResizeObserver` on the list both set `scrollTop = scrollHeight`. Scrolling on `count` alone is simpler but misses opening the phone panel and crossing to desktop.
14. **The toggle** is `button-quiet round-history-toggle`, `aria-expanded`, its open state `useState(false)` in `RoundHistory`; `display: none` from 51.75 rem. Its 44 px target reaches into the panel's padding by a negative `margin-block`, starting from Edit's `calc(-1 * var(--space-3))`; Task 5's layout case judges the value. If no value keeps the label's height without shrinking the target, back to the spec.
15. **The last row's slack.** Centring alone: no list margin, no padding change, so the panel keeps every panel's padding; the gap under the last row stays half the row's slack (about 3.5 px) wider. Task 4's mockup step shows it to the user beside the other panels; if it still looks unbalanced, the fallback is a `--row-pad` token as the rows' `padding-block`, taken back by the list's `margin-bottom` (a ruling change, back to the user). Subtracting the slack from the padding is exact today but ties the padding to the row's text style, which can drift unseen.
16. **Existing cases.** Every `next-issue` request posted through `page.request` gains `outcome: { type: 'Skip' }` in Task 1. In Task 1 the expected bodies in "Next issue moves the room on" and "Cancel and Escape change nothing" gain `outcome: { type: 'Skip' }`; Task 3 changes them to `{ type: 'Estimate', value: '5' }` and has Bob vote `5` before the held run's reveal, so that round pre-selects too. The layout case "a long issue and a failed move…" checks `Skip` and clicks the dialog's Next issue instead of pressing Enter, since nobody voted; its comment loses "only the failure message takes the dialog past it", now untrue.
17. **README** in Task 1: the `/next-issue` row's body and its recording, `400` for a blank value or unknown type, `history` in the snapshot example and its sentence. **Mockup** `docs/design/room.html` per the spec's Documents section: its estimate row in Task 3, before the dialog's CSS that carries it over; its panel in Task 4.
18. **Delivery.** One PR from `20261116.round-history`, based on `20261109.next-issue` while #565 is open, holding the spec, this plan, the code, README and mockup, linking #528.

## Review Focus

1. **`?` as the single top value**: pre-selected, recorded, and shown as `?` in the row. Test: Task 2, `preselected` over every deck value; Task 4, the recording case's first round is Bob's `?`.
2. **An issue edited while the dialog is open**: the legend follows the shown issue and the entry holds the edited one. Test: Task 4, "an issue edited while the dialog is open is the one recorded".
3. **A page that joins late** sees every entry. Test: Task 4, Carol joins after the recording case's rounds and reads the same rows.
4. **A full history beside a full roster at 1280 by 600**: the roster still scrolls inside the sidebar and nothing runs past the page. Test: Task 5, "a full history and a full roster share the sidebar at the floor".
5. **An empty issue**: the legend reads `Estimate for Round ‹entries + 1›` and the row `Round ‹position›`. Test: Task 4, the recording case's second round.

---

### Task 1: The room records, the snapshot carries

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`, `actors/RoomManager.scala`, `actors/RoomSnapshot.scala`, `Requests.scala`, `API.scala`
- Modify: `README.md`; regenerate `frontend/src/protocol/generated/openapi.json` and `openapi.d.ts`
- Modify: `frontend/src/protocol/snapshot.ts`, `frontend/src/protocol/api.ts`, `frontend/src/room/view.ts`, `frontend/src/room/nextIssue.ts` (`Choice` only), `frontend/src/components/RoomPage.tsx`, `frontend/src/components/useNextIssue.ts`
- Test: `RoomSpec.scala`, `RoomSnapshotSpec.scala`, `SnapshotContractSpec.scala`, `APISpec.scala`, `RoomManagerSpec.scala`, `RoomDataFixtures.scala`, `frontend/src/protocol/api.test.ts`, `snapshot.test.ts`, `frontend/src/room/view.test.ts`, `frontend/src/room/connection.test.ts`, `e2e/next.spec.js`

**Interfaces:**
- Produces (server): `Room.Outcome`, `Room.Entry`, `RoomState.history`; `Room.NextIssue(token, round, issue, outcome: Option[Room.Outcome], replyTo)`; `RoomManager.NextIssue(roomId, token, round, issue, outcome, replyTo)`; `Choice` with `recorded`; `NextIssueRequest(round: Int, issue: String, outcome: Choice)`; fixture `withHistory`.
- Produces (page): `RoomSnapshot['history']`; `Entry`; `View.history: Entry[]`; `Choice`; `api.nextIssue(roomId: string, round: number, issue: string, outcome: Choice): Promise<void>`; `useNextIssue`'s `send: (round: number, issue: string, outcome: Choice) => Promise<void>`.

- [ ] **Step 1: Write the failing server tests**
  - `RoomSpec`, "record the outcome with the issue being left": `withIssue("PP-1")`, revealed; `NextIssue(token, 1, "PP-2", Some(Estimate("8")))`, then `NextIssue(token, 2, "PP-3", Some(Unsettled))`. `GetData` shows `history == Vector(Entry("PP-1", Estimate("8")), Entry("PP-2", Unsettled))`, and the probes' last snapshot carries the same two, in order.
  - `RoomSpec`, "record nothing for a skip": `NextIssue(token, 1, "PP-2", None)` answers `Applied`, the issue is `PP-2`, `history` empty.
  - `RoomSpec`: the refusal case's requests carry `Some(Estimate("8"))` and start from `withHistory(Entry("PP-0", Unsettled))`, so "`GetData` equals the data before" also pins the history; the memberless-session case's `NextIssue` carries `Some(Unsettled)`; "move on to the next issue in one snapshot" and "move on from a voting round, and re-arm the auto-reveal" pass `None`.
  - `RoomSnapshotSpec`, "carry the room's history, oldest first": `withHistory(Entry("PP-1", Estimate("3")), Entry("PP-2", Unsettled))` gives that list.
  - `SnapshotContractSpec`: a state `history` holding `Entry("PP-1", Estimate("8"))` and `Entry("", Unsettled)`.
  - `RoomManagerSpec`: the relay case's command carries `Some(Estimate("8"))`.
  - `APISpec`: "dispatch a next-issue command" sends `NextIssueRequest(4, "PP-2", Choice.Estimate("8"))` and the manager receives `Some(Room.Outcome.Estimate("8"))`; a second run with `Choice.Skip` receives `None`. "answer 400 for a blank estimate or an unknown outcome": raw bodies `{"round":4,"issue":"PP-2","outcome":{"type":"Estimate","value":" "}}` and `{…"outcome":{"type":"Maybe"}}` each answer `400` and dispatch nothing. The fake manager's `RoomManager.NextIssue` pattern gains the outcome, and the existing `409`, `401` and `403` cases send `Choice.Skip`.
- [ ] **Step 2: Run** `sbt test` — Expected: compilation fails on `Outcome`, `Entry`, `history`, `Choice`.
- [ ] **Step 3: Implement** rulings 1 to 5; `API` passes `request.outcome.recorded`.
- [ ] **Step 4: Run** `sbt test styleCheck` — Expected: PASS; `target/contract/history.json` exists and every contract file carries `"history"`.
- [ ] **Step 5: Prove two tests can fail.** Record the request's `issue` instead of the room's: "record the outcome…" goes red. Record an entry for `None` too (as `Unsettled`): "record nothing for a skip" goes red. Drop the `Validator.custom`: the blank-value request answers `204` and the `400` case goes red. Decode any other `type` as `Skip`: the unknown-type request goes red. Revert all four; a mutation that stays green is a finding, not a skip.
- [ ] **Step 6: Regenerate and wire the page.** `sbt genOpenApi && npm run gen:api`. `snapshot.ts`'s `build` gains `history: z.array(object({ issue: z.string(), outcome }))` after `round`, `outcome` a `discriminatedUnion` of `Estimate` (with `value: z.string()`) and `Unsettled`, each built with `build`'s `object` so the strict schema refuses unknown keys; `View.history` from `applySnapshot`; `api.nextIssue` sends `{ round, issue, outcome }`; `useNextIssue`'s `send` gains the outcome and `RoomPage` passes `{ type: 'Skip' }` (ruling 6). Tests: `api.test.ts` "next-issue posts the round, the issue and the outcome"; `snapshot.test.ts` refuses an outcome of type `Skip` in `history`; `view.test.ts` fixtures and `snapshot.test.ts`'s `withSeat` gain `history: []`, one row asserting `view.history`; `connection.test.ts`'s `frame` gains `history: []`, and its unknown-field case sends `later: 1` instead of `history: []`.
- [ ] **Step 7: Update the e2e posts and bodies** per ruling 16 (Task 1's half).
- [ ] **Step 8: Run** `npm run typecheck && npm run lint && npm run test:unit && npm run e2e -- e2e/next.spec.js` — Expected: PASS, the contract test reading `history.json`.
- [ ] **Step 9: README** per ruling 17.
- [ ] **Step 10: Commit** `feat: record the round's outcome when the room moves on`

### Task 2: The short form and the pre-selection

**Files:**
- Create: `frontend/src/room/history.ts`, `frontend/src/room/history.test.ts`
- Modify: `frontend/src/room/nextIssue.ts`, `frontend/src/room/nextIssue.test.ts`

**Interfaces:**
- Consumes: `Choice` (Task 1); `resultHeadline` (`room/result.ts`).
- Produces: `Short`, `shortForm(issue: string, position: number): Short`; `preselected(deck, revealed, summary): Choice | null`.

- [ ] **Step 1: Write the failing tests.** `history.test.ts`: one `it.each` row per line of the spec's "Short form scenarios", the blank row at position 3 for both `""` and `"   "`, asserting `{ kind, text }`. `nextIssue.test.ts`: for every value of a deck `['1', '2', '?']`, that value alone on top (`[[v, 2], [other, 1]]`), revealed, gives `{ type: 'Estimate', value: v }`; `null` for a tie (`[['2', 1], ['3', 1]]`), a top value off the deck (`[['7', 2], ['1', 1]]`), nobody voted (`[]`), and a single value while voting (`revealed` false).
- [ ] **Step 2: Run** `npm run test:unit` — Expected: FAIL, missing exports.
- [ ] **Step 3: Implement** rulings 8 and 11.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Prove two tests can fail.** Keep a link's query: the "Jira with a query" row goes red. Drop `preselected`'s on-deck check: the off-deck case goes red. Revert both.
- [ ] **Step 6: Commit** `feat: add the round history's short form and the estimate's pre-selection`

### Task 3: The estimate row

**Files:**
- Modify: `frontend/src/room/nextIssue.ts`, `frontend/src/components/useNextIssue.ts`, `NextIssueDialog.tsx`, `next-issue-dialog.css`, `RoomPage.tsx`, `docs/design/room.html`
- Test: `frontend/src/room/nextIssue.test.ts`, `e2e/next.spec.js`, `e2e/fixtures.js`, `e2e/layout.spec.js` (ruling 16's layout case)

**Interfaces:**
- Consumes: `shortForm`, `preselected` (Task 2); `Choice`, `View.history` (Task 1).
- Produces: `NextState`/`NextEvent` per ruling 9; `useNextIssue(issue, round, send)` returning `shows`' view plus `open(checked: Choice | null)`, `choose(choice: Choice)`, `firstRadioRef`; `NextIssueDialog({ next, issue, position, onClosed })`, `position` being `view.history.length + 1`; fixtures `estimateRow(page)` (`nextDialog(page).getByRole('group', { name: /^Estimate for / })`) and `estimateRadio(page, name)` (`getByRole('radio', { name, exact: true })` within the dialog).

- [ ] **Step 1: Write the failing matrix tests**, one per changed cell of the spec's dialog matrix: `pressed` with `checked` from each state gives Open with that choice and `missing: false`; `chose` in Open sets it and clears `missing`, in Sending and Closed leaves `s`; `submit` in Open with none gives `missing: true` and no Sending, with one gives Sending carrying it and both messages cleared; a failed answer gives Open with the choice kept; `shows(open with missing, opening + 1)` gives `missing: false`. The existing exact-shape expectations on Open, Sending and `shows` gain `choice` and `missing`.
- [ ] **Step 2: Run** `npm run test:unit` — Expected: FAIL.
- [ ] **Step 3: Implement the matrix** (ruling 9). **Run** — Expected: PASS.
- [ ] **Step 4: Write the failing e2e cases** in `e2e/next.spec.js`:
  - "the dialog sends the chosen outcome": `revealedRound`; open: `estimateRadio('5')` checked, the legend reads `Estimate for PP-1`, focus in the field; Enter. Then Bob votes `3`, reveal, open, check `Unsettled`, click the dialog's Next issue; then reveal, open, check `Skip`, click it again. `nextSent` holds the three outcomes in order.
  - "a tie opens with nothing checked, and submitting asks for a choice": Alice `3`, Bob `5`, reveal; open: no radio checked; Enter: `nextStatus` reads `Choose an estimate, Unsettled or Skip`, focus on `estimateRadio('0')`, nothing sent; check `5`: `nextStatus` empty.
  - "a failed move keeps the choice": route aborted; check `Unsettled`, submit: the failure message, `Unsettled` still checked; unroute, submit: one more request, carrying `Unsettled`.
  - "a radio cannot be changed while sending": route held, submit; click `estimateRadio('8')` with `force`: `5` still checked; release.
- [ ] **Step 5: Run** `npm run e2e -- e2e/next.spec.js` — Expected: FAIL, no estimate row.
- [ ] **Step 6: Mockup's estimate row** per ruling 17 (decision 3): a `fieldset` with the legend `Estimate for ‹short form›` per decision 5, `Round ‹entries + 1›` for an empty issue, the `?` chip kept; the chips native radios in labels as ruling 10, drawn by `:has(:checked)` and `:has(:focus-visible)`, so they click with no script; the dialog's buttons stay static.
- [ ] **Step 7: Implement** the hook and the dialog (ruling 10), the chips' CSS carried over from Step 6's `.next-chips`, `.next-chip`, `.next-chip-word` and `.next-form`'s gap, the legend `overflow-wrap: anywhere` with its `<bdi>` `text-transform: none` as `.next-form-issue`; `RoomPage` wires `open` (ruling 8), `position` and the real choice into `send`.
- [ ] **Step 8: Update the existing cases** per ruling 16 (Task 3's half). **Run** `npm run e2e -- e2e/next.spec.js e2e/layout.spec.js` — Expected: PASS in both browsers.
- [ ] **Step 9: Prove three cases can fail**, reverting and rebuilding after each: `submit` with none sends anyway (the tie case); a failed answer drops the choice (the failed-move case); `chose` applies while sending (the read-only case).
- [ ] **Step 10: Commit** `feat: ask for the round's estimate in the Next issue dialog`

### Task 4: The round history panel

**Files:**
- Create: `frontend/src/components/RoundHistory.tsx`, `round-history.css`, `useStickToEnd.ts`, `e2e/history.spec.js`
- Modify: `frontend/src/components/RoomPage.tsx`, `docs/design/room.html`, `e2e/fixtures.js`

**Interfaces:**
- Consumes: `View.history` (Task 1); `shortForm` (Task 2); `Figure`.
- Produces: `RoundHistory({ history }: { history: Entry[] })`, rendered first in `.room-page-sidebar`, nothing while empty; `useStickToEnd`; fixtures `historyPanel(page)` (`getByRole('region', { name: /^Rounds · / })`), `historyRows(page)` (its `listitem`s), `historyToggle(page)`, and `recordRounds(page, room, from, issues)` posting one move per issue through `page.request`, rounds `from` onwards, each `{ type: 'Estimate', value: '3' }`; each move's issue is the next entry's, since an entry holds the issue being left.

- [ ] **Step 1: Write the failing e2e cases** in `e2e/history.spec.js`, at 1280 by 680 unless named:
  - "recording shows the history on every page": no panel on either page; Bob votes `?`, Alice moves on to an empty issue with `?` pre-selected; then the legend reads `Estimate for Round 2`, Alice checks `Unsettled` and moves on to `PP-3`; then `Skip`. On both pages: label `Rounds · 2`, rows `PP-1 ?` and `Round 2 Unsettled`, the second bold (`font-weight` ≥ 600), the first not; no row has a `title`. Carol joins: the same rows.
  - "an issue edited while the dialog is open is the one recorded": Alice opens the dialog; Bob edits the issue to `PP-1b`; the legend reads `Estimate for PP-1b`; Alice submits: the row reads `PP-1b`.
  - "the list grows with its entries": two entries, the list's height is twice `--row-height` (±0.5 px); at 392 by 800, after Show more, the same.
  - "the phone panel": 392 by 800; one entry: the panel sits between the issue and the table (box order), no toggle, the row shown; two: the closed panel shows the latest row only, `Show more` (`aria-expanded="false"`) opens both rows and reads `Show less`, a third entry keeps it open with the new row in view, `Show less` closes it.
  - "the list stays where it was read, and moves to the end for a new entry": `recordRounds` to 6 entries; the list scrolled to 0; Bob votes: `scrollTop` still 0; a seventh entry: the last row's box within the list's.
  - "crossing from the phone layout shows the latest row": 6 entries at 392 by 800, closed; `setViewportSize` 1280 by 680: the last row's box within the list's.
  - "a link row keeps its end, a text row its start": entries recorded through `recordRounds`' issues for a long Jira link, `https://github.com/acme/web/issues/412` and `ISSUE_240`-length text starting with a link and words; at 1280 by 680, the long link's `<bdi>` right edge is within its cell's (±0.5) and its left edge before the cell's; the short link's left edge is at the cell's left (±0.5); the text row's first range rect starts at the cell's left and its `scrollWidth` exceeds `clientWidth`.
- [ ] **Step 2: Run** `npm run e2e -- e2e/history.spec.js` — Expected: FAIL, no panel.
- [ ] **Step 3: Implement** rulings 12 to 15: desktop `ol` `max-height: calc(5 * var(--row-height))`, `overflow: auto`; rows `display: flex`, `align-items: center`, `height: var(--row-height)`; the issue cell `flex: 1`, `min-width: 0`, `white-space: nowrap`, `overflow: hidden`, `text-overflow: ellipsis`, the link cell adding `direction: rtl; text-align: left`; `li:last-child` `font-weight: var(--weight-strong)`. Phone (`width < 51.75rem`): `order: 1`; closed `li:not(:last-child) { display: none }`; opened `max-height: calc(3 * var(--row-height))`.
- [ ] **Step 4: Run** `npm run e2e -- e2e/history.spec.js e2e/next.spec.js e2e/phone.spec.js e2e/layout.spec.js` — Expected: PASS in both browsers.
- [ ] **Step 5: Prove four cases can fail**, reverting and rebuilding after each: drop the `ResizeObserver` (the crossing case); scroll on every render (the vote leaves the scroll case); drop `direction: rtl` (the link row case); `max-height` to `height` (the grows case).
- [ ] **Step 6: Mockup's panel** per ruling 17 (decision 6): history oldest first, `max-height` instead of `height`, the phone panel at `order: 1` with both states and labels, Show more / Show less toggling it on click as ☰ toggles its row, centred rows, no `title`. Show the user the panel's bottom gap beside the other panels (ruling 15) before Step 7.
- [ ] **Step 7: Commit** `feat: show the round history beside the roster and under the issue`

### Task 5: Layout, both browsers

**Files:**
- Modify: `e2e/layout.spec.js`, `frontend/src/components/round-history.css` (only if the case asks)

- [ ] **Step 1: Add the cases**, outside "the narrow layouts", with `containerAt` and heights below 762 px:
  - "the phone panel's label line keeps the label's height with the toggle", in the describe that holds `containerAt`: two entries; at 320 and at 51.75 rem minus 1 px, closed and opened, the head line's height equals the label's (±0.5) and the toggle's box is at least 44 by 44.
  - "a legend with a one-segment link wider than the dialog wraps within it, 320 by 640": the issue `https://example.com/` plus 120 letters with no slash; open the dialog: the legend's box within the dialog's, the dialog's `scrollWidth` not over its `clientWidth`.
  - "a full history and a full roster share the sidebar at the floor" (Review Focus 4): 1280 by 600, `fill` with enough voters that the roster overflows, then `recordRounds` to 6 entries: the roster's `scrollHeight` exceeds its `clientHeight`, its box ends within the sidebar's, the history list is 5 rows tall, and the page does not scroll vertically.
- [ ] **Step 2: Run** `npm run e2e -- e2e/layout.spec.js` — Expected: PASS in both browsers; a toggle that cannot hold the line goes back to the spec (ruling 14).
- [ ] **Step 3: Prove all three can fail**: drop the toggle's negative margin (the label case); drop the legend's `overflow-wrap` (the legend case); drop the desktop list's `max-height` (the sidebar case). Revert, `npm run build`.
- [ ] **Step 4: Commit** `test: check the round history's phone panel and the legend at their narrowest`

### Task 6: Hand check and PR

- [ ] **Step 1:** Re-check every citation in the files this branch changed (CLAUDE.md lessons).
- [ ] **Step 2:** Draft the front cut's WebKit risk as a section to append to #495 (spec decision 5): a phone hand check that a long link row shows its end and a short one starts at the left. Show the text to the user; post only once round history ships.
- [ ] **Step 3:** Run the whole suite: `sbt test styleCheck && npm run typecheck && npm run lint && npm run test:unit && npm run e2e` — Expected: PASS.
- [ ] **Step 4:** Open the PR per ruling 18, after the final review.
