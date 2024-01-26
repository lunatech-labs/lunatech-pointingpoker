package com.lunatech.pointingpoker.domain;

import java.time.Instant;

public record RoomState(String lastMessageId, Instant openedAt) {
  public static RoomState initial() {
    return new RoomState("0", Instant.now());
  }
}
