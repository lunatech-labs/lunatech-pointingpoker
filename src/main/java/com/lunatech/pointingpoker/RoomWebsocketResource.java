package com.lunatech.pointingpoker;

import io.quarkus.logging.Log;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.websocket.OnClose;
import jakarta.websocket.OnError;
import jakarta.websocket.OnMessage;
import jakarta.websocket.OnOpen;
import jakarta.websocket.Session;
import jakarta.websocket.server.PathParam;
import jakarta.websocket.server.ServerEndpoint;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

//TODO: Custom decoders websocket path params (I.e.: UUID)

@ServerEndpoint(value = "/api/room/ws/{roomId}/{userId}")
@ApplicationScoped
public class RoomWebsocketResource {

  ConcurrentMap<String, Session> sessions = new ConcurrentHashMap<>();

  @OnOpen
  public void onOpen(Session session, @PathParam("roomId") String roomId,
      @PathParam("userId") String userId) {
    Log.debugf("Open session for room %s with user %s", roomId, userId);
    sessions.put(makeKey(roomId, userId), session);
  }

  @OnError
  public void onError(@PathParam("roomId") String roomId,
      @PathParam("userId") String userId, Throwable error) {
    Log.debugf("Error on socket for room %s with user %s due to error: %s", roomId, userId, error);
    sessions.remove(makeKey(roomId, userId));
  }

  @OnClose
  public void onClose(@PathParam("roomId") String roomId,
      @PathParam("userId") String userId) {
    Log.debugf("Close session for room %s with user %s", roomId, userId);
    sessions.remove(makeKey(roomId, userId));
  }

  @OnMessage
  public void onMessage(@PathParam("roomId") String roomId, @PathParam("userId") String userId,
      String message, Session s) {
    Log.debugf("Got message %s", message);
    s.getAsyncRemote().sendText("PONG " + message + " MAUU", res -> {
      if (res.getException() != null) {
        Log.errorf("Error sending message for room %s user %s due to error %s", roomId, userId,
            res.getException());
      }
    });
  }

  private String makeKey(String roomId, String userId) {
    return roomId + "::" + userId;
  }
}
