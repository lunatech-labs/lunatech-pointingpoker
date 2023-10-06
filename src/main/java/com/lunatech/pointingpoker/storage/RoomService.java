package com.lunatech.pointingpoker.storage;

import io.quarkus.redis.datasource.ReactiveRedisDataSource;
import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.UUID;

@ApplicationScoped
public class RoomService {


  private final ReactiveRedisDataSource dataSource;

  public RoomService(ReactiveRedisDataSource dataSource){
    this.dataSource = dataSource;
  }


  public Uni<UUID> createRoom(){
    UUID roomID = UUID.randomUUID();
    return Uni.createFrom().item(roomID);
  }

}
