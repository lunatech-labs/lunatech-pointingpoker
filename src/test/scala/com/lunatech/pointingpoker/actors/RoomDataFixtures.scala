package com.lunatech.pointingpoker.actors

import java.util.UUID

import org.apache.pekko.actor.ActorRef as UntypedRef

import com.lunatech.pointingpoker.actors.Room.RoomData

object RoomDataFixtures:

  // One person's state groups as a single test record, so a fixture site reads as a
  // participant rather than as an entry in each of three maps.
  final case class Attendee(
      id: UUID,
      name: String,
      voted: Boolean,
      estimation: String,
      ref: UntypedRef,
      token: Room.SessionToken
  ):
    def asUser: Room.User = Room.User(id, name, ref, token)

  def withUsers(users: Attendee*): RoomData =
    RoomData.of(
      users.map(_.asUser).toList,
      sessionsFor(users*),
      Room.RoomState("", Room.Round(estimatesFor(users*), revealed = false))
    )

  extension (data: RoomData)
    def withIssue(issue: String): RoomData =
      RoomData.of(data.users, data.sessions, data.state.copy(currentIssue = issue))

    def withRevealed(): RoomData =
      RoomData.of(data.users, data.sessions, withRound(data, _.copy(revealed = true)))

    // A session whose member has gone or has not yet arrived; both reach the same state.
    def withMemberlessSession(users: Attendee*): RoomData =
      RoomData.of(data.users, data.sessions ++ sessionsFor(users*), data.state)

    // An estimate with no member, which a departure leaves behind and the join must drop.
    def withEstimate(user: Attendee): RoomData =
      RoomData.of(
        data.users,
        data.sessions,
        withRound(data, r => r.copy(estimates = r.estimates ++ estimatesFor(user)))
      )

    def estimateFor(user: Attendee): Option[(String, Boolean)] =
      data.state.round.estimates.get(user.id).map(e => (e.value, e.confirmed))
  end extension

  private def withRound(data: RoomData, f: Room.Round => Room.Round): Room.RoomState =
    data.state.copy(round = f(data.state.round))

  private def sessionsFor(users: Attendee*): Map[Room.SessionToken, Room.Session] =
    users.map(u => u.token -> Room.Session(u.id, u.name)).toMap

  private def estimatesFor(users: Attendee*): Map[UUID, Room.Estimate] =
    // A blank estimation is no entry at all; Estimate.of would refuse to build one.
    users
      .filterNot(_.estimation.isBlank)
      .map(u => u.id -> Room.Estimate.of(u.estimation, u.voted))
      .toMap
end RoomDataFixtures
