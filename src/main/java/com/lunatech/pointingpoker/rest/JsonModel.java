package com.lunatech.pointingpoker.rest;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.util.List;
import java.util.UUID;
import org.hibernate.validator.constraints.Length;

public interface JsonModel {

  record CreateJoinRoomRequest(
      @Length(min = 3, message = "Username must be at least 3 characters long")
      @NotBlank(message = "UserName may not be blank")
      @Pattern(regexp = "^[A-Za-z0-9]*$", message = "Username must be alphanumeric")
      String userName
  ) {

  }

  record CreateRoomResponse(UUID roomId, UserDetails user) {

  }

  record JoinRoomResponse(UserDetails user) {

  }

  record GetRoomResponse(UUID id, List<UserDetails> users) {

  }

  record UserDetails(UUID id, String name) {

  }
}
