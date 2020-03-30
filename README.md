# Poiting Poker

### Description
This project provides a web/websocket based pointing poker session.

### Messaging

Web socket messaging is based on the class `WSMessage`. Json example:

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
* "clear"
* "leave"

`roomId` and `userId` should be `UUID`.

`extra` value depends `messageType`.

### API

Available endpoints:

| Path                             | Method    | Description                                               |
|----------------------------------|-----------|-----------------------------------------------------------|
|`/`                               | GET       | Load index with frontend                                  |
|`/create-room`                    | POST      | Creates a room and returns roomId                         |
|`/websocket/[roomId]/[user-name]` | WebSocket | Creates a websocket connection and joins the user to room |

### Tech stack

This project uses:
  * Vue.js
  * Akka/Akka-http

### Deployment

