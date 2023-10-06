package com.lunatech.pointingpoker.rest;

import com.lunatech.pointingpoker.rest.jsonmodel.CreateJoinRoomRequest;
import com.lunatech.pointingpoker.rest.jsonmodel.CreateRoomResponse;
import com.lunatech.pointingpoker.rest.jsonmodel.JoinRoomResponse;
import com.lunatech.pointingpoker.rest.jsonmodel.UserDetails;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HEAD;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import java.util.UUID;
import org.jboss.resteasy.reactive.RestResponse;

@Path("/api/room")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class RoomController {


  @POST
  public CreateRoomResponse createRoom(CreateJoinRoomRequest req) {
    return new CreateRoomResponse(UUID.randomUUID(), new UserDetails(UUID.randomUUID(), req.userName()));
  }


  @HEAD
  @Path("/{roomId}")
  public RestResponse<Object> checkRoom(@PathParam("roomId") UUID roomId){
    return RestResponse.ok();
  }

  @GET
  @Path("/{roomId}")
  public RestResponse<Object> getRoom(@PathParam("roomId") UUID roomId) {
    return RestResponse.ok();
  }

  @POST
  @Path("/{roomId}/join")
  public JoinRoomResponse joinRoom(@PathParam("roomId") UUID roomId, CreateJoinRoomRequest req) {
    return new JoinRoomResponse(new UserDetails(UUID.randomUUID(), req.userName()));
  }
}
