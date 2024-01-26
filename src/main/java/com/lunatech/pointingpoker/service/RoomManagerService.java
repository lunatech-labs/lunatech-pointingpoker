package com.lunatech.pointingpoker.service;

import com.lunatech.pointingpoker.storage.RedisStorage;
import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.UUID;

@ApplicationScoped
public class RoomManagerService {

  private final RedisStorage store;

  public RoomManagerService(RedisStorage store){
    this.store = store;
  }

  public Uni<UUID> makeRoom() {
    UUID roomID = UUID.randomUUID();
    return store.ensureRoomStreamPresent(roomID).replaceWith(roomID);
  }

  public Uni<Boolean> roomExists(UUID id){
    return store.checkStream(id);
  }
}
