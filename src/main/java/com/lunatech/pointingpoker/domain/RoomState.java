package com.lunatech.pointingpoker.domain;

import java.time.Instant;
import java.util.Collections;
import java.util.Map;
import java.util.UUID;

/**
 * @param lastMessageId - id of the last message produced as a result of an update to this
 *                      roomstate
 * @param openedAt      - time when the room was opened
 * @param users         - users in the room, note: immutable map
 */
public record RoomState(UUID roomId, String lastMessageId, Instant openedAt,
                        Map<UUID, String> users) {

  public static RoomState initial(UUID roomId) {
    return new RoomState(roomId, "0", Instant.now(), Collections.emptyMap());
  }
}
