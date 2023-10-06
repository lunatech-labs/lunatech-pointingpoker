package com.lunatech.pointingpoker.rest.jsonmodel;

import java.util.UUID;

public record CreateRoomResponse(UUID roomId, UserDetails user){ }
