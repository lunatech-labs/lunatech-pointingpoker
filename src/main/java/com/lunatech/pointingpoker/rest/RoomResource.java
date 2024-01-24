package com.lunatech.pointingpoker.rest;

import com.lunatech.pointingpoker.rest.JsonModel.CreateJoinRoomRequest;
import com.lunatech.pointingpoker.rest.JsonModel.CreateRoomResponse;
import com.lunatech.pointingpoker.rest.JsonModel.GetRoomResponse;
import com.lunatech.pointingpoker.rest.JsonModel.JoinRoomResponse;
import com.lunatech.pointingpoker.rest.JsonModel.UserDetails;
import io.vertx.core.eventbus.EventBus;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HEAD;
import jakarta.ws.rs.InternalServerErrorException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import java.util.UUID;

@Path("/api/room")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class RoomResource {

  @POST
  public CreateRoomResponse createRoom(@Valid CreateJoinRoomRequest req) {
    return new CreateRoomResponse(UUID.randomUUID(),
        new UserDetails(UUID.randomUUID(), req.userName()));
  }

  @HEAD
  @Path("/{roomId}")
  public void checkRoom(@PathParam("roomId") UUID roomId) {
    throw new InternalServerErrorException("Not yet implemented");
  }

  @GET
  @Path("/{roomId}")
  public GetRoomResponse getRoom(@PathParam("roomId") UUID roomId) {
    throw new InternalServerErrorException("Not yet implemented");
  }

  @POST
  @Path("/{roomId}/join")
  public JoinRoomResponse joinRoom(@PathParam("roomId") UUID roomId, CreateJoinRoomRequest req) {
    throw new InternalServerErrorException("Not yet implemented");
  }
}
