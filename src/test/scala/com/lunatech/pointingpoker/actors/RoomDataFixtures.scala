package com.lunatech.pointingpoker.actors

import com.lunatech.pointingpoker.actors.Room.RoomData

object RoomDataFixtures:

  def withUsers(users: Room.User*): RoomData =
    RoomData.of(users.toList, sessionsFor(users*))

  extension (data: RoomData)
    def withIssue(issue: String): RoomData =
      RoomData.of(data.users, data.sessions, issue, data.revealed)

    def withRevealed(revealed: Boolean = true): RoomData =
      RoomData.of(data.users, data.sessions, data.currentIssue, revealed)

    // A session whose member has gone or has not yet arrived; both reach the same state.
    def withMemberlessSession(users: Room.User*): RoomData =
      RoomData.of(
        data.users,
        data.sessions ++ sessionsFor(users*),
        data.currentIssue,
        data.revealed
      )
  end extension

  private def sessionsFor(users: Room.User*): Map[Room.SessionToken, Room.Session] =
    users.map(u => u.token -> Room.Session(u.id, u.name)).toMap
end RoomDataFixtures
