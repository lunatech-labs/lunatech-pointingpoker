package com.lunatech.pointingpoker.service;

import com.lunatech.pointingpoker.storage.RedisStorage;
import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@ApplicationScoped
public class RoomManagerService {

  private final RedisStorage store;

  private final ConcurrentMap<UUID, Room> activeRooms;

  public RoomManagerService(RedisStorage store){
    this.store = store;
    this.activeRooms = new ConcurrentHashMap<>();
  }

  public Uni<UUID> makeRoom() {
    UUID roomID = UUID.randomUUID();
  }

  public Uni<Boolean> roomExists(UUID id){
    return store.checkStream(id.toString());
  }
}
