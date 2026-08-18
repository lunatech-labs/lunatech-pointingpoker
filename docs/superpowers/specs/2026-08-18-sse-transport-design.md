# SSE + HTTP POST Transport (replaces WebSocket)

Date: 2026-08-18
Status: Approved design, pending implementation plan

## Purpose

This is Phase 1 / PR1 of the roadmap in `todolist.txt`: replace the current
WebSocket transport with Server-Sent Events (push) + authenticated HTTP POST
(commands). It is the foundation the rest of the roadmap depends on, since
per-request identity validation (PR2) only makes sense once client actions
are discrete HTTP calls rather than fields inside a long-lived socket
payload.

**Scope boundary:** this PR is a pure transport swap. It deliberately
preserves the current (insecure) trust model — `userId` is still supplied
by the client and not cross-checked against connection identity. Closing
that gap is PR2's job. Likewise, the current behavior of silently
auto-creating a room for any unknown `roomId` is preserved as-is; rejecting
unknown rooms is a Phase 2 item, out of scope here. No protocol/behavior
redesign beyond swapping the carrier.

## Current architecture (for reference)

- `API.scala`: single route `path("websocket" / JavaUUID / Remaining)` calls
  `handleWebSocketMessages(WS.handler(...))`.
- `WS.scala`: `WS.handler` mints a `UUID.randomUUID()` per connection and
  builds a `Flow` from a `Sink` (decodes incoming `WSMessage` JSON, forwards
  to `RoomManager`) and a `Source.actorRef` (outgoing messages). The
  `Source`'s materialized `ActorRef` is registered with `RoomManager` via
  `ConnectToRoom` as soon as the socket opens — i.e. **Join already happens
  automatically at connect time**, not as a separate client-sent command.
  The `Sink`'s completion (`Sink.actorRef(..., WSCompleted, WSFailure)`)
  fires when the socket closes, triggering `Room.Leave`.
- `RoomManager.scala`: `ConnectToRoom` finds-or-creates the `Room` actor and
  sends `Room.Join(User(...))`. `IncomeWSMessage` dispatches by
  `MessageType` to typed `Room.Command`s (`Vote`, `ShowVotes`, `ClearVotes`,
  `ReVote`, `EditIssue`).
- `Room.scala`: holds `RoomData(users: List[User], ...)` where
  `User.ref: UntypedRef` **is** the per-connection actor ref. `broadcast`
  just does `user.ref ! message` for every user. `setupNewUser` replays
  `Init`, current `EditIssue`, and per-user `Join`/`Vote` messages to a
  newly-joined ref to catch it up on room state — already a sequence of
  discrete typed messages, not one snapshot blob.
- `WSMessage.scala`: one flat case class `(messageType, roomId, userId,
  extra)` shared by every command/event, circe-encoded/decoded.

This means **`Room.scala`'s broadcast/catch-up logic is transport-agnostic
already** — it only depends on having an `ActorRef` to push to, not on that
ref being backed by a WebSocket.

## New architecture

### Join flow

1. `POST /rooms/{roomId}/join` with body `{"name": "..."}`. Handler mints
   `userId = UUID.randomUUID()` and returns `{"userId": "..."}`. No actor
   interaction — mirrors today's inline mint in `WS.handler`, since a
   `User` record requires a `ref`, which doesn't exist until the SSE stream
   opens.
2. Client opens `GET /rooms/{roomId}/events?userId=...&name=...` (SSE).
   This reuses today's `source()` construction verbatim: `Source.actorRef`
   materializes an `ActorRef`, and `.mapMaterializedValue` sends
   `RoomManager.ConnectToRoom(...)` exactly as it does today — same
   find-or-create-room, same `Room.Join`, same `setupNewUser` catch-up
   replay.

### Commands

Each gets its own POST endpoint with a small typed JSON body:

- `POST /rooms/{roomId}/vote` — `{"estimation": "..."}`
- `POST /rooms/{roomId}/show`
- `POST /rooms/{roomId}/clear`
- `POST /rooms/{roomId}/revote`
- `POST /rooms/{roomId}/edit-issue` — `{"issue": "..."}`

All still take `userId` (query param or body field — implementation detail)
since identity validation is out of scope for this PR. `RoomManager` gets
typed commands (`Vote(roomId, userId, estimation)`, `Show(roomId, userId)`,
etc.) replacing the generic `IncomeWSMessage(WSMessage)` dispatch; each does
the same `data.rooms.get(roomId).foreach(room => room ! Room.X(...))` lookup
`handleIncomeMessage` does today. Unknown `roomId` → no-op, 200/204
response (exact parity with today's silent no-op — no 404 introduced here).

### Push (server → client)

Unchanged in shape: `Room.broadcast`/`setupNewUser` keep sending the same
`WSMessage`-shaped events (`Init`, `Join`, `Vote`, `Show`, `Clear`,
`Revote`, `EditIssue`, `Leave`) to each participant's `ref`. The only change
is that `ref` now points at an SSE connection instead of a WS connection,
and those messages are marshalled as `text/event-stream` (Pekko HTTP's
`EventStreamMarshalling`) instead of WS text frames.

### Leave detection

Today, closing the WS socket completes the inbound `Sink`, which fires
`WSCompleted` → `Room.Leave`. SSE has no inbound stream tied to the
connection (commands are separate stateless POSTs), so leave detection
moves to the **outbound** side: `.watchTermination()` on the SSE source,
whose completion/failure future sends `RoomManager.WSCompleted`/`WSFailure`
(possibly renamed to transport-neutral names) exactly as today — same
effect, same `Room.Leave` trigger, just observed from the other end of the
pipe.

## File-by-file changes

| File | Change |
|---|---|
| `API.scala` | Remove the `websocket` route. Add `POST /rooms/{roomId}/join`, `GET /rooms/{roomId}/events`, and `POST /rooms/{roomId}/{vote,show,clear,revote,edit-issue}`. |
| `WS.scala` | Delete inbound `Sink`/decode logic (no client→server stream anymore). Keep/adapt `source()` as the SSE source constructor, reused as-is for the events endpoint. Consider renaming the file/object since "WS" no longer fits (e.g. `SSE.scala`) — implementation detail. |
| `RoomManager.scala` | Replace `IncomeWSMessage`/`UnsupportedWSMessage`/`handleIncomeMessage` with typed per-command messages. `ConnectToRoom` unchanged. `WSCompleted`/`WSFailure` now triggered from SSE `watchTermination()` instead of an inbound sink completing. |
| `Room.scala` | **No changes.** |
| `WSMessage.scala` | Keep the outbound case class/encoder/`MessageType` (still the SSE wire format). Delete the inbound decoder (dead code — nothing parses an incoming `WSMessage` anymore). |
| `index.html` | Replace the WS client (~230 lines in the inline `<script>`) with: `fetch(POST /join)` → `new EventSource(.../events?...)`, `onmessage` parsing the same JSON shape as today and dispatching to the same Vue handlers; command sends become `fetch(POST ...)` instead of `ws.send(...)`. |

## Error handling

- Malformed JSON body on a command POST → 400, via Pekko HTTP's default
  entity-unmarshalling rejection handling (no new code).
- SSE stream failure / abrupt client disconnect → same path as a clean
  disconnect, via `watchTermination()`'s failure branch; logged and
  triggers `Room.Leave`, mirroring today's `WSFailure` logging.
- Unknown `roomId` on a command POST → 200/204 no-op, exact parity with
  today (see Scope boundary above).
- No new input validation is introduced anywhere in this PR.

## Testing

- `RoomSpec`: unchanged (Room untouched).
- `RoomManagerSpec`: replace `IncomeWSMessage`-based cases with the new
  typed command cases.
- `APISpec`: replace the WebSocket test harness with an SSE test harness
  (Pekko HTTP testkit can assert on `text/event-stream` responses) plus
  request/response tests for the new POST endpoints.
- Manual end-to-end pass required beyond unit tests: two browser tabs,
  exercise join, vote, show, clear, revote, edit-issue, and leave (via tab
  close) through the real app.
