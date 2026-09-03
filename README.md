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
|`/rooms/{roomId}/join`           | POST   | `{"name": "..."}`     | Mints a userId and a session, returns `{"userId": "..."}`, and sets a room-scoped session cookie |
|`/rooms/{roomId}/events`         | GET    | none                  | Opens the SSE stream (`text/event-stream`) and joins the user to the room. Requires a valid session cookie from a prior `/join`; `401` otherwise |
|`/rooms/{roomId}/vote`           | POST   | `{"estimation": "..."}` | Casts the user's vote. Requires the session cookie                 |
|`/rooms/{roomId}/show`           | POST   | none                  | Reveals all votes in the room. Requires the session cookie           |
|`/rooms/{roomId}/clear`          | POST   | none                  | Clears all votes in the room. Requires the session cookie            |
|`/rooms/{roomId}/revote`         | POST   | none                  | Starts a new voting round. Requires the session cookie               |
|`/rooms/{roomId}/edit-issue`     | POST   | `{"issue": "..."}`    | Updates the room's current issue. Requires the session cookie        |

Command endpoints return `204 No Content`. An unknown `roomId`, or a missing/invalid
session cookie, is a silent no-op.

There is also a `GET /{roomId}` route that serves the same frontend index page,
so a room link can be shared directly.

### Cookies

`/join` sets one cookie, scoped to `Path=/rooms/{roomId}`: a session token used to
authorize later requests to that room. It's `HttpOnly` (never read by JavaScript),
`SameSite=Strict`, and has no `Max-Age`/`Expires` (it's cleared when the browser
closes). As a strictly-necessary functional cookie (it exists only to operate the
session the user actively joined, not for tracking or analytics), it doesn't require
a cookie-consent banner under the ePrivacy Directive.

This session cookie closes an identity-spoofing gap, not room access control: anyone
who knows a `roomId` can still call `/join` and legitimately participate in that
room. What it prevents is impersonating a specific existing member and acting
without ever having joined. Actual room access control (e.g. limiting who can create
or enter a room at all) is a separate, unscheduled concern, closest to the
room-creation hardening listed under Phase 5 in `docs/roadmap.md`.

### Tech stack

This project uses:
  * Vue.js
  * pekko/pekko-http

### Roadmap and known issues

This app is going through a multi-PR modernization effort. See
[`docs/roadmap.md`](docs/roadmap.md) for the phased plan and
[`docs/known-issues.md`](docs/known-issues.md) for open bugs and technical debt
found along the way that are not yet scheduled or fixed.

### Testing

The Scala suite:

```
sbt test
```

There is also a Node testkit under `testkit/`, exercised by `node --test`. It contains a
stub buffering proxy that reproduces the response-scanning appliance a customer reported,
and a harness that starts the packaged app. The reproduction half needs the app staged first:

```
sbt "; coverageOff; Universal/stage"
npm test
```

`coverageOff` is insurance rather than a requirement in this form: enabling coverage is a
session setting, so a separate `sbt` invocation recompiles without instrumentation anyway.
It earns its place if you ever stage from the same sbt shell that ran `qa`, where the
instrumented classes do get packaged and no scoverage runtime is staged to satisfy them.

The browser suite under `e2e/` drives the same packaged app through the stub in Chromium and
Firefox, one app and one stub per Playwright worker:

```
npm ci
npx playwright install --with-deps chromium firefox
sbt "; coverageOff; Universal/stage"
npm run e2e
```

Cases that pin behaviour the app gets wrong today are marked `test.fail()` and annotated with
the step that fixes each, so the suite is green until a fix lands and then reports its own
annotation as stale. A case reported as "expected to fail, but passed" means the fix arrived:
drop the annotation in the same change.

The stub also runs standalone, so the failure can be reproduced by hand. Start the app with
plain-HTTP cookies, or the room will fail to populate for the unrelated reason in "Running
locally" below and the reproduction will look successful when it is not:

```
SECURE_COOKIES=false sbt run
UPSTREAM=http://localhost:8080 node testkit/stub.js --buffering
```

It prints its own address; point a browser at that instead of the app. The page itself still
loads, because it is a finite response the stub releases whole. What fails is the room: the
browser stays on the Create page and never displays the room at all, since the client switches
views only when the first SSE message arrives and the stream never ends, so the stub releases
nothing and destroys the connection at its deadline. That is the customer's reported symptom,
against a modelled appliance rather than a measured one: the stub's deadline is a placeholder
rather than a measurement of theirs. It is also why the reproduction test asserts against
`/rooms/{roomId}/events` rather than `/`. Buffering can be switched at runtime with
`/__stub/buffering?mode=on` and `?mode=off`, which affects later requests rather than ones
already in flight. Recovering needs no reload: `EventSource` retries on its own, so the page
moves from Create to the room a second or two after `?mode=off`.

### Running locally

`SECURE_COOKIES` defaults to `true`, which marks the session cookie `Secure` (the
browser will not send it back over a plain-HTTP connection). Local development that
isn't served over HTTPS needs:

```
SECURE_COOKIES=false sbt run
```

Without this, `/join` will appear to succeed but every subsequent request will get a
`401`, since the cookie set by `/join` never comes back on `/events`.

### Deployment

