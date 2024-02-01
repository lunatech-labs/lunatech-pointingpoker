package com.lunatech.pointingpoker.domain;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public record RoomState(String lastMessageId, Instant openedAt, Map<UUID, String> users) {
  public static RoomState initial() {
    return new RoomState("0", Instant.now(), new HashMap<>());
  }
}
