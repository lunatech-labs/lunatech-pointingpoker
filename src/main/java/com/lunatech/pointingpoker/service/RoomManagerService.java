package com.lunatech.pointingpoker.service;

import com.lunatech.pointingpoker.domain.RoomState;
import com.lunatech.pointingpoker.storage.RedisStorage;
import io.smallrye.mutiny.Uni;
import io.vertx.mutiny.core.Vertx;
import jakarta.enterprise.context.ApplicationScoped;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import org.eclipse.microprofile.config.inject.ConfigProperty;

@ApplicationScoped
public class RoomManagerService {

  private final RedisStorage store;
  private final Duration roomTTL;

  public RoomManagerService(RedisStorage store, Vertx vertx,
      @ConfigProperty(name = "pointing.roomttlmin") long roomTtlMinutes) {
    this.store = store;
    this.roomTTL = Duration.ofMinutes(roomTtlMinutes);
  }

  public Uni<UUID> makeRoom() {
    UUID roomID = UUID.randomUUID();
    RoomState initialState = RoomState.initial();
    return store.setRoomState(roomID, initialState, initialState.openedAt().plus(roomTTL))
        .replaceWith(roomID);
  }

  public Uni<Boolean> roomExists(UUID id) {
    return store.stateExists(id);
  }

  public Uni<Optional<RoomState>> getRoomStateByID(UUID id) {
    return store.getRoomState(id);
  }
}
