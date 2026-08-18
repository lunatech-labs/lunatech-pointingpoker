# Poiting Poker

### Description
This project provides an HTTP + Server-Sent-Events (SSE) based pointing poker session.

### Messaging

Clients send commands as plain HTTP POST requests (see the API table below). The
server pushes room updates the other way, over a long-lived SSE stream opened on
`GET /rooms/{roomId}/events`. Each pushed event carries one `RoomEvent` JSON
object as its `data` payload. Json example:

```json
{
    "messageType": "join",
    "roomId": "42c31270-6eaa-4dd7-adfc-b7c131022597",
    "userId": "9f3820e1-37aa-4602-8994-2ce1da8e1e54",
    "extra": "John Doe"
}
```

Possible values for messageType:
* "init"
* "join"
* "vote"
* "show"
* "revote"
* "clear"
* "leave"
* "edit_issue"

`roomId` and `userId` should be `UUID`.

`extra` value depends `messageType`.

The stream also emits an SSE heartbeat comment every 15 seconds, so an idle
connection is not closed by the server's idle timeout.

### API

Available endpoints:

| Path                            | Method | Request body          | Description                                                          |
|---------------------------------|--------|-----------------------|----------------------------------------------------------------------|
|`/`                              | GET    | none                  | Load index with frontend                                             |
|`/create-room`                   | POST   | none                  | Creates a room and returns the roomId as plain text                  |
|`/rooms/{roomId}/join`           | POST   | `{"name": "..."}`     | Mints a userId for the room and returns `{"userId": "..."}`          |
|`/rooms/{roomId}/events`         | GET    | none                  | Opens the SSE stream (`text/event-stream`) and joins the user to the room. Requires `userId` and `name` query parameters |
|`/rooms/{roomId}/vote`           | POST   | `{"estimation": "..."}` | Casts the user's vote. Requires a `userId` query parameter          |
|`/rooms/{roomId}/show`           | POST   | none                  | Reveals all votes in the room. Requires a `userId` query parameter    |
|`/rooms/{roomId}/clear`          | POST   | none                  | Clears all votes in the room. Requires a `userId` query parameter     |
|`/rooms/{roomId}/revote`         | POST   | none                  | Starts a new voting round. Requires a `userId` query parameter        |
|`/rooms/{roomId}/edit-issue`     | POST   | `{"issue": "..."}`    | Updates the room's current issue. Requires a `userId` query parameter |

Command endpoints return `204 No Content`. An unknown `roomId` is a silent no-op.

There is also a `GET /{roomId}` route that serves the same frontend index page,
so a room link can be shared directly.

### Tech stack

This project uses:
  * Vue.js
  * pekko/pekko-http

### Deployment

