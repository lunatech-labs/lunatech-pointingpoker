package com.lunatech.pointingpoker.service;

import com.lunatech.pointingpoker.domain.RoomCommand;
import com.lunatech.pointingpoker.domain.RoomState;
import com.lunatech.pointingpoker.storage.RedisStorage;
import com.lunatech.pointingpoker.storage.RedisStorage.Message;
import io.smallrye.mutiny.Uni;
import io.smallrye.mutiny.subscription.Cancellable;
import java.util.UUID;

public class Room {

  private final RedisStorage store;
  private final RoomManagerService roomManager;
  private final UUID roomId;

  private RoomState state;
  private Cancellable streamSubscription;

  public Room(UUID id, RedisStorage store, RoomManagerService roomMgr) {
    this.roomId = id;
    this.store = store;
    this.roomManager = roomMgr;
  }

  public Uni<Void> start(){
    return store.getRoomState(roomId)
        .map(maybeState -> maybeState.orElse(RoomState.initial()))
        .onItem()
        .invoke(state -> {
          this.state = state;
          this.streamSubscription = store
              .readCommands(this.roomId, state.lastMessageId())
              .subscribe()
              .with(this::processRoomCommands);
        })
        .replaceWithVoid();
  }

  private void processRoomCommands(Message<RoomCommand> msg) {


  }



}
