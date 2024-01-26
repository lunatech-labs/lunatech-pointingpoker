package com.lunatech.pointingpoker.storage;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lunatech.pointingpoker.domain.RoomState;
import com.lunatech.pointingpoker.service.Room;
import io.quarkus.redis.datasource.ReactiveRedisDataSource;
import io.quarkus.redis.datasource.keys.ReactiveKeyCommands;
import io.quarkus.redis.datasource.stream.ReactiveStreamCommands;
import io.quarkus.redis.datasource.stream.StreamMessage;
import io.quarkus.redis.datasource.value.ReactiveValueCommands;
import io.quarkus.redis.datasource.value.SetArgs;
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.Uni;
import io.smallrye.mutiny.tuples.Tuple;
import io.smallrye.mutiny.tuples.Tuple2;
import io.smallrye.mutiny.unchecked.Unchecked;
import jakarta.enterprise.context.ApplicationScoped;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.eclipse.microprofile.config.inject.ConfigProperty;

@ApplicationScoped
public class RedisStorage {

  private static final String MSG_KEY = "message";

  private final ReactiveKeyCommands<String> keyCommands;
  private final ReactiveStreamCommands<String, String, String> streamCommands;
  private final ReactiveValueCommands<String, RoomState> rsCommands;

  private final ObjectMapper mapper;

  public RedisStorage(ReactiveRedisDataSource rds, ObjectMapper mapper) {
    this.keyCommands = rds.key(String.class);
    this.streamCommands = rds.stream(String.class, String.class, String.class);
    this.rsCommands = rds.value(String.class, RoomState.class);
    this.mapper = mapper;
  }

  private String makeStateKey(UUID id){
    return "state."+id.toString();
  }

  public Uni<Optional<RoomState>> getRoomState(UUID roomId) {
    return rsCommands
        .get(makeStateKey(roomId))
        .map(Optional::ofNullable);
  }

  public Uni<Void> setRoomState(UUID roomId, RoomState value, Instant expireAt){
    var args = new SetArgs();
    args.exAt(expireAt);
    return rsCommands.set(makeStateKey(roomId), value, args);
  }

  public Uni<Boolean> ensureStream(String key, Instant expireAt) {
    return checkKey(key).flatMap(roomExists -> {
      if (!roomExists) {
        return streamCommands
            .xadd(key, Collections.singletonMap("start", key))
            .replaceWith(ensureTimeout(key, expireAt));
      } else {
        return ensureTimeout(key, expireAt);
      }
    });
  }

  public Uni<Boolean> checkKey(String key) {
    return keyCommands.exists(key);
  }
  public Uni<Boolean> ensureTimeout(String key, Instant expireAt){
    return keyCommands.expireat(key, expireAt);
  }

  public <T> Multi<? extends T> readMessageStream(String key, Class<T> decodeTo) {
    return readMessageStream(key, "0", decodeTo);
  }

  public <T> Multi<? extends T> readMessageStream(String key, String lastSeenId,
      Class<T> decodeTo) {
    return readNonEmptyStreamSlice(key, lastSeenId)
        .toMulti()
        .flatMap(items -> {
          String newListSeenId = items.isEmpty() ? lastSeenId : items.getLast().id();
          return Multi.createFrom()
              .iterable(items)
              .filter(item -> item.payload().containsKey(MSG_KEY))
              .map(Unchecked.function(item -> {
                var str = item.payload().get(MSG_KEY);
                return mapper.readValue(str, decodeTo);
              }))
              .onCompletion()
              .switchTo(readMessageStream(key, newListSeenId, decodeTo));
        });
  }

  private Uni<List<StreamMessage<String, String, String>>> readNonEmptyStreamSlice(String key,
      String lastSeenId) {
    return streamCommands.xread(key, lastSeenId).flatMap(res -> {
      if (res.isEmpty()) {
        // resort to polling when there are no new items.
        return Uni.createFrom()
            .voidItem()
            .onItem()
            .delayIt()
            .by(Duration.ofMillis(50))
            .flatMap(_ -> readNonEmptyStreamSlice(key, lastSeenId));
      } else {
        return Uni.createFrom().item(res);
      }
    });
  }
}

