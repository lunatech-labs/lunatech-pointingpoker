package com.lunatech.pointingpoker.domain;

public sealed interface RoomCommand {
  record AddUser(String userName) implements RoomCommand {

  }
}
