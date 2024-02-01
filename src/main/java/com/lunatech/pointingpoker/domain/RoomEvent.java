package com.lunatech.pointingpoker.domain;

public sealed interface RoomEvent {

  record RoomOpened() implements RoomEvent {}
  record UserJoined(String userName) implements RoomEvent {}
}
