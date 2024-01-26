package com.lunatech.pointingpoker.rest;

import static io.restassured.RestAssured.given;
import static jakarta.ws.rs.core.MediaType.APPLICATION_JSON;
import static jakarta.ws.rs.core.Response.Status.BAD_REQUEST;
import static jakarta.ws.rs.core.Response.Status.NOT_FOUND;
import static jakarta.ws.rs.core.Response.Status.OK;
import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.hasItems;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import com.lunatech.pointingpoker.rest.JsonModel.CreateJoinRoomRequest;
import com.lunatech.pointingpoker.rest.JsonModel.CreateRoomResponse;
import com.lunatech.pointingpoker.rest.JsonModel.GetRoomResponse;
import com.lunatech.pointingpoker.rest.JsonModel.JoinRoomResponse;
import com.lunatech.pointingpoker.rest.JsonModel.UserDetails;
import io.quarkus.test.common.http.TestHTTPEndpoint;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

@QuarkusTest
@TestHTTPEndpoint(RoomResource.class)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
public class RoomResourceTest {

  private static final String USER1 = "testUser";
  private static final String USER2 = "testUser2";

  private static UUID roomId;

  @Test
  void shouldNotHeadRandomId() {
    UUID testRoomId = UUID.randomUUID();
    given().pathParam("id", testRoomId.toString())
        .when().head("/{id}")
        .then().statusCode(NOT_FOUND.getStatusCode());
  }

  @Test
  void shouldNotGetRandomId() {
    UUID testRoomId = UUID.randomUUID();
    given().pathParam("id", testRoomId.toString())
        .when().get("/{id}")
        .then().statusCode(NOT_FOUND.getStatusCode());

  }

  @Test
  void shouldNotJoinRandomId() {
    UUID testRoomId = UUID.randomUUID();
    CreateJoinRoomRequest req = new CreateJoinRoomRequest("testUser");
    given()
        .pathParam("id", testRoomId)
        .body(req)
        .contentType(APPLICATION_JSON)
        .accept(ContentType.JSON)
        .when()
        .post("/{id}/join")
        .then()
        .statusCode(BAD_REQUEST.getStatusCode());
  }

  @ParameterizedTest
  @ValueSource(strings = {"", "1", "2", "ab", "%%%", "      ", "$@!^#&*!$!@#"})
  void shouldNotAcceptInvalidUsernames(String userName) {
    CreateJoinRoomRequest req = new CreateJoinRoomRequest(userName);
    given()
        .body(req)
        .contentType(APPLICATION_JSON)
        .accept(ContentType.JSON)
        .when()
        .post()
        .then()
        .statusCode(BAD_REQUEST.getStatusCode());
  }


  @Test
  @Order(1)
  void shouldCreateRoom() {
    CreateJoinRoomRequest req = new CreateJoinRoomRequest(USER1);
    CreateRoomResponse res = given()
        .body(req)
        .contentType(APPLICATION_JSON)
        .accept(ContentType.JSON)
        .when()
        .post()
        .then()
        .statusCode(OK.getStatusCode())
        .contentType(APPLICATION_JSON)
        .extract()
        .body()
        .as(CreateRoomResponse.class);

    assertNotNull(res);
    roomId = res.roomId();

    //Ensure room is actually created!
    given()
        .pathParam("id", roomId)
        .when()
        .head("/{id}")
        .then()
        .statusCode(OK.getStatusCode());
  }

  @Test
  @Order(2)
  void createdRoomShouldContainUser() {
    GetRoomResponse res = given()
        .pathParam("id", roomId)
        .accept(ContentType.JSON)
        .when()
        .get("/{id}")
        .then()
        .statusCode(OK.getStatusCode())
        .contentType(APPLICATION_JSON)
        .extract()
        .body()
        .as(GetRoomResponse.class);

    assertEquals(roomId, res.id());
    assertEquals(1, res.users().size());
    List<String> userNames = res.users().stream().map(UserDetails::name).toList();
    assertThat(userNames, hasItems(USER1));
  }

  @Test
  @Order(3)
  void createdRoomShouldAcceptNewUser() {
    CreateJoinRoomRequest req = new CreateJoinRoomRequest(USER2);
    JoinRoomResponse res = given()
        .pathParam("id", roomId)
        .accept(ContentType.JSON)
        .contentType(APPLICATION_JSON)
        .body(req)
        .when()
        .post("/{id}/join")
        .then()
        .statusCode(OK.getStatusCode())
        .contentType(APPLICATION_JSON)
        .extract()
        .body()
        .as(JoinRoomResponse.class);

    assertEquals("testUser2", res.user().name());
  }

  @Test
  @Order(4)
  void createdRoomShouldHaveTwoUsers() {
    GetRoomResponse res = given()
        .pathParam("id", roomId)
        .accept(ContentType.JSON)
        .contentType(APPLICATION_JSON)
        .when()
        .get("/{id}")
        .then()
        .statusCode(OK.getStatusCode())
        .contentType(APPLICATION_JSON)
        .extract()
        .body().as(GetRoomResponse.class);

    assertEquals(roomId, res.id());
    assertEquals(2, res.users().size());
    List<String> userNames = res.users().stream().map(UserDetails::name).toList();
    assertThat(userNames, hasItems(USER1, USER2));
  }


}
