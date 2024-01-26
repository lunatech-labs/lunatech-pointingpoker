package com.lunatech.pointingpoker.service;

import com.lunatech.pointingpoker.domain.RoomState;
import com.lunatech.pointingpoker.storage.RedisStorage;
import io.smallrye.mutiny.Uni;
import io.smallrye.mutiny.operators.multi.processors.BroadcastProcessor;
import io.smallrye.mutiny.operators.multi.processors.UnicastProcessor;
import io.smallrye.mutiny.vertx.core.AbstractVerticle;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public class Room extends AbstractVerticle {

  private final RedisStorage store;
  private final RoomManagerService roomManager;
  private final UUID roomId;

  public Room(UUID id, RedisStorage store, RoomManagerService roomMgr) {
    this.roomId = id;
    this.store = store;
    this.roomManager = roomMgr;
  }

  public Uni<Void> start(){
    //load state:
    store
        .getRoomState(roomId)
        .map(maybeState -> maybeState.orElse(RoomState.initial()))
        .map(state -> {
        });


  }



}
