package com.lunatech.pointingpoker.service;

import com.lunatech.pointingpoker.domain.RoomState;
import com.lunatech.pointingpoker.storage.RedisStorage;
import io.smallrye.mutiny.Uni;
import io.smallrye.mutiny.tuples.Tuple2;
import jakarta.enterprise.context.ApplicationScoped;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import org.eclipse.microprofile.config.inject.ConfigProperty;

@ApplicationScoped
public class RoomManagerService {

  private final RedisStorage store;
  private final Duration roomTTL;

  public RoomManagerService(RedisStorage store,
      @ConfigProperty(name = "pointing.roomttlmin") long roomTtlMinutes) {
    this.store = store;
    this.roomTTL = Duration.ofMinutes(roomTtlMinutes);
  }

  public Uni<Tuple2<UUID, UUID>> makeRoom(String initialUserName) {
    UUID roomID = UUID.randomUUID();
    RoomState initialState = RoomState.initial(roomID);
    return store
        .insertRoomMetadata(initialState)
        .replaceWith(addUserToRoom(roomID, initialUserName))
        .map(userId -> Tuple2.of(roomID, userId));
  }

  public Uni<Optional<RoomState>> getRoom(UUID id) {
    return store.getRoomState(id);
  }

  public Uni<UUID> addUserToRoom(UUID roomId, String userName){
    UUID userId = UUID.randomUUID();
    return store.insertUser(roomId, userId, userName).replaceWith(userId);
  }

  public Uni<Boolean> roomExists(UUID id) {
    return store.roomExists(id);
  }

  public Uni<Optional<RoomState>> getRoomStateByID(UUID id) {
    return store.getRoomState(id);
  }
}
