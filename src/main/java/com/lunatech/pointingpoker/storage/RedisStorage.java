package com.lunatech.pointingpoker.storage;

import static com.lunatech.pointingpoker.storage.RedisStorage.RedisCollection.AUTHINFO;
import static com.lunatech.pointingpoker.storage.RedisStorage.RedisCollection.USERNAMES;

import com.lunatech.pointingpoker.domain.RoomState;
import io.quarkus.redis.datasource.ReactiveRedisDataSource;
import io.quarkus.redis.datasource.hash.ReactiveHashCommands;
import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@ApplicationScoped
public class RedisStorage {

  private final ReactiveRedisDataSource noTxRedisDataSource;

  public RedisStorage(ReactiveRedisDataSource redisDataSource) {
    this.noTxRedisDataSource = redisDataSource;
  }

  public Uni<Boolean> roomExists(UUID roomId) {
    return noTxRedisDataSource.key().exists(RedisCollection.METADATA.getKey(roomId));
  }


  public Uni<Void> insertRoomMetadata(RoomState roomState) {
    var mappedData = RedisHashData.roomMetadataFromRoomState(roomState);
    return roomMetadataCommands(noTxRedisDataSource).hset(mappedData.key, mappedData.fields)
        .flatMap(res -> {
          if (res == mappedData.fields.size()) {
            return Uni.createFrom().voidItem();
          } else {
            return Uni.createFrom().failure(new StorageException(
                "Failed to insert room metadata for room %s".formatted(roomState.roomId())));
          }
        });
  }

  public Uni<Void> insertUser(UUID roomId, UUID userId, String userName, String userKey) {
    var userMapCommands = userMapCommands(noTxRedisDataSource, String.class);
    var storeUserName = userMapCommands.hset(USERNAMES.getKey(roomId), userId, userName);
    var storeUserToken = userMapCommands.hset(AUTHINFO.getKey(roomId), userId, userKey);

    return Uni.combine()
        .all().unis(storeUserName, storeUserToken)
        .with(Boolean::logicalAnd)
        .flatMap(res -> {
          if (res) {
            return Uni.createFrom().voidItem();
          } else {
            return Uni.createFrom().failure(new StorageException("Error adding user to room"));
          }
        });
  }

  public Uni<Optional<RoomState>> getRoomState(UUID roomId) {
    var roomExists = roomExists(roomId);
    var roomMetadata = roomMetadataCommands(noTxRedisDataSource).hgetall(
        RedisCollection.METADATA.getKey(roomId));
    var usersMap = userMapCommands(noTxRedisDataSource, String.class).hgetall(
        USERNAMES.getKey(roomId));
    return roomExists.flatMap(exists -> {
      if (!exists) {
        return Uni.createFrom().item(Optional.empty());
      } else {
        return Uni.combine().all().unis(roomMetadata, usersMap).with(
            (metadata, users) -> Optional.of(new RoomState(roomId, metadata.get("lastMessageId"),
                Instant.parse(metadata.get("openedAt")), users)));
      }
    });
  }

  //Datasource creation helpers
  private ReactiveHashCommands<String, String, String> roomMetadataCommands(
      ReactiveRedisDataSource redisDataSource) {
    return redisDataSource.hash(String.class, String.class, String.class);
  }

  private <T> ReactiveHashCommands<String, UUID, T> userMapCommands(
      ReactiveRedisDataSource redisDataSource, Class<T> valueClazz) {
    return redisDataSource.hash(String.class, UUID.class, valueClazz);
  }

  record RedisHashData<K, V>(String key, Map<K, V> fields) {

    static RedisHashData<String, String> roomMetadataFromRoomState(RoomState roomState) {
      return new RedisHashData<>(
          RedisCollection.METADATA.getKey(roomState.roomId()),
          Map.of(
              "lastMessageId", roomState.lastMessageId(),
              "openedAt", roomState.openedAt().toString()
          )
      );
    }
  }

  enum RedisCollection {
    USERNAMES, AUTHINFO, USERVOTES, METADATA, EVENTS;

    String getKey(UUID roomId) {
      return switch (this) {
        case USERNAMES -> roomId + ":users";
        case USERVOTES -> roomId + ":votes";
        case METADATA -> roomId + ":metadata";
        case EVENTS -> roomId + ":events";
        case AUTHINFO -> roomId + ":tokens";
      };
    }
  }
}


