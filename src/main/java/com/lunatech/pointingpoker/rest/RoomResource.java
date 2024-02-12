package com.lunatech.pointingpoker.rest;

import com.lunatech.pointingpoker.rest.JsonModel.CreateJoinRoomRequest;
import com.lunatech.pointingpoker.rest.JsonModel.CreateRoomResponse;
import com.lunatech.pointingpoker.rest.JsonModel.GetRoomResponse;
import com.lunatech.pointingpoker.rest.JsonModel.JoinRoomResponse;
import com.lunatech.pointingpoker.rest.JsonModel.UserInfo;
import com.lunatech.pointingpoker.service.RoomManagerService;
import io.smallrye.mutiny.Uni;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HEAD;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response.Status;
import java.util.UUID;
import org.jboss.resteasy.reactive.RestResponse;

@Path("/api/room")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class RoomResource {

  private final RoomManagerService svc;

  public RoomResource(RoomManagerService svc) {
    this.svc = svc;
  }

  @POST
  public Uni<CreateRoomResponse> createRoom(@Valid CreateJoinRoomRequest req) {
    return svc.makeRoom(req.userName()).map(roomState -> {
      var room = roomState.getItem1();
      var user = roomState.getItem2();
      return new CreateRoomResponse(room, user);
    });
  }

  @HEAD
  @Path("/{roomId}")
  public Uni<RestResponse<?>> checkRoom(@PathParam("roomId") UUID roomId) {
    return svc.roomExists(roomId).map(exists -> {
      if (exists) {
        return RestResponse.ok();
      } else {
        return RestResponse.notFound();
      }
    });
  }

  @GET
  @Path("/{roomId}")
  public Uni<RestResponse<GetRoomResponse>> getRoom(@PathParam("roomId") UUID roomId) {
    return svc.getRoom(roomId).map(roomState -> {
      if (roomState.isPresent()) {
        var userNames = roomState.get()
            .users()
            .entrySet().stream()
            .map(e -> new UserInfo(e.getKey(), e.getValue()))
            .toList();
        return RestResponse.ok(new GetRoomResponse(roomId, userNames));
      } else {
        return RestResponse.notFound();
      }
    });
  }

  @POST
  @Path("/{roomId}/join")
  public Uni<RestResponse<JoinRoomResponse>> joinRoom(@PathParam("roomId") UUID roomId, CreateJoinRoomRequest req) {
    return svc.roomExists(roomId).map(exists -> {
      if (exists) {
        return RestResponse.ok(new JoinRoomResponse(UUID.randomUUID()));
      } else {
        return RestResponse.status(Status.BAD_REQUEST);
      }
    });
  }
}
