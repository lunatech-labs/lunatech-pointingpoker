package com.lunatech.pointingpoker.domain;

import java.util.UUID;

public sealed interface RoomCommand {
  record OpenRoom() implements RoomCommand {}

  record AddUser(String userName, UUID userId) implements RoomCommand {

  }
}
