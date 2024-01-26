package com.lunatech.pointingpoker.storage;

import io.quarkus.redis.datasource.ReactiveRedisDataSource;
import io.quarkus.redis.datasource.keys.ReactiveKeyCommands;
import io.quarkus.redis.datasource.stream.ReactiveStreamCommands;
import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import java.time.Duration;
import java.util.Collections;
import java.util.UUID;

@ApplicationScoped
public class RedisStorage {

  private final ReactiveKeyCommands<UUID> keyCommands;
  private final ReactiveStreamCommands<UUID, String, String> streamCommands;

  public RedisStorage(ReactiveRedisDataSource rds) {
    this.keyCommands = rds.key(UUID.class);
    //TODO: Better type.
    this.streamCommands = rds.stream(UUID.class, String.class, String.class);
  }

  public Uni<Boolean> ensureRoomStreamPresent(UUID id) {
    return checkStream(id).flatMap(roomExists -> {
      if (!roomExists) {
        return streamCommands.xadd(id, Collections.singletonMap("start", id.toString()))
            .replaceWith(keyCommands.expire(id, Duration.ofHours(8)));
      } else {
        return Uni.createFrom().item(true);
      }
    });
  }

  public Uni<Boolean> checkStream(UUID id) {
    return keyCommands.exists(id);
  }

}
