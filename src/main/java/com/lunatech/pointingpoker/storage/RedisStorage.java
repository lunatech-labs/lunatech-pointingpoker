package com.lunatech.pointingpoker.storage;

import com.lunatech.pointingpoker.domain.RoomCommand;
import com.lunatech.pointingpoker.domain.RoomEvent;
import com.lunatech.pointingpoker.domain.RoomState;
import io.quarkus.redis.datasource.ReactiveRedisDataSource;
import io.quarkus.redis.datasource.keys.KeyScanArgs;
import io.quarkus.redis.datasource.keys.ReactiveKeyCommands;
import io.quarkus.redis.datasource.stream.ReactiveStreamCommands;
import io.quarkus.redis.datasource.stream.StreamMessage;
import io.quarkus.redis.datasource.value.ReactiveValueCommands;
import io.quarkus.redis.datasource.value.SetArgs;
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import java.time.Duration;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@ApplicationScoped
public class RedisStorage {

  private static final String MSG_KEY = "message";
  private final ReactiveKeyCommands<String> keyCommands;
  private final ReactiveValueCommands<String, RoomState> rsCommands;

  private final TypedStreamOps<RoomCommand> commandOps;
  private final TypedStreamOps<RoomEvent> eventOps;

  public RedisStorage(ReactiveRedisDataSource rds) {
    this.keyCommands = rds.key(String.class);
    this.rsCommands = rds.value(String.class, RoomState.class);

    this.eventOps = new TypedStreamOps<>(RoomEvent.class, "events", rds);
    this.commandOps = new TypedStreamOps<>(RoomCommand.class, "commands", rds);
  }

  private String makeStateKey(UUID id) {
    return id.toString()+".state";
  }

  public Uni<Boolean> stateExists(UUID roomId) {
    return checkKey(makeStateKey(roomId));
  }
  public Uni<Optional<RoomState>> getRoomState(UUID roomId) {
    return rsCommands.get(makeStateKey(roomId)).map(Optional::ofNullable);
  }

  public Uni<Void> setRoomState(UUID roomId, RoomState value, Instant expireAt) {
    var args = new SetArgs();
    args.exAt(expireAt);
    return rsCommands.set(makeStateKey(roomId), value, args);
  }

  private Uni<Boolean> checkKey(String key) {
    return keyCommands.exists(key);
  }

  public Uni<Boolean> ensureTimeout(UUID roomId, Instant expireAt) {
    var scanParams = new KeyScanArgs();
    scanParams.match(roomId.toString()+".*");
    return keyCommands
        .scan(scanParams)
        .toMulti()
        .flatMap(k -> keyCommands.expireat(k, expireAt).toMulti())
        .collect()
        .with(Collectors.reducing((l,r) -> l && r))
        .map(o -> o.orElse(false));
  }

  public Multi<Message<RoomCommand>> readAllCommands(UUID roomId) {
    return readCommands(roomId, "0");
  }
  public Multi<Message<RoomCommand>> readCommands(UUID roomId, String lastSeenId){
    return this.commandOps.readMessageStream(roomId, lastSeenId);
  }

  public <T extends RoomCommand> Uni<Void> writeCommand(UUID roomId, T cmd) {
    return this.commandOps.writeValue(roomId, cmd);
  }

  public record Message<T>(String messageId, T message){}
  private class TypedStreamOps<T> {

    private final ReactiveStreamCommands<String, String, T> streamCommands;
    private final String postfix;

    TypedStreamOps(Class<T> clazz, String postfix, ReactiveRedisDataSource r) {
      this.streamCommands = r.stream(clazz);
      this.postfix = postfix;
    }

    public String makeKey(UUID id) {
      return id.toString() + "." + postfix;
    }

    public <I extends T> Uni<Void> writeValue(UUID roomId, I in) {
      String key = makeKey(roomId);
      return checkKey(key).flatMap(exists ->
        streamCommands
            .xadd(key, Collections.singletonMap(MSG_KEY, in))
            .replaceWith(Uni.createFrom().voidItem())
      );
    }

    public Multi<Message<T>> readMessageStream(UUID roomId, String lastSeenId) {
      var key = makeKey(roomId);
      return readNonEmptyStreamSlice(key, lastSeenId).toMulti().flatMap(items -> {
        String newListSeenId = items.isEmpty() ? lastSeenId : items.getLast().id();
        return Multi.createFrom().iterable(items)
            .filter(item -> item.payload().containsKey(MSG_KEY))
            .map(item -> new Message<>(item.id(), item.payload().get(MSG_KEY)))
            .onCompletion()
            .switchTo(() -> readMessageStream(roomId, newListSeenId));
      });
    }

    private Uni<List<StreamMessage<String, String, T>>> readNonEmptyStreamSlice(String key,
        String lastSeenId) {
      return streamCommands.xread(key, lastSeenId).flatMap(res -> {
        if (res == null || res.isEmpty()) {
          // resort to polling when there are no new items.
          return Uni.createFrom().voidItem().onItem().delayIt().by(Duration.ofMillis(50))
              .replaceWith(readNonEmptyStreamSlice(key, lastSeenId));
        } else {
          return Uni.createFrom().item(res);
        }
      });
    }
  }
}


