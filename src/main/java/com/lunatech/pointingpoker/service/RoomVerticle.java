package com.lunatech.pointingpoker.service;

import io.smallrye.mutiny.vertx.core.AbstractVerticle;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public class RoomVerticle extends AbstractVerticle {

  private final UUID roomId;
  private final Map<UUID, String> users;

  public RoomVerticle(UUID id) {
    this.roomId = id;
    this.users = new HashMap<>();
  }



}
