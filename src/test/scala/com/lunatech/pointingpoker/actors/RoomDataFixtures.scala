package com.lunatech.pointingpoker.actors

import java.util.UUID

import scala.concurrent.duration.*

import org.apache.pekko.actor.ActorRef as UntypedRef

import com.lunatech.pointingpoker.actors.Room.RoomData

object RoomDataFixtures:

  // Room and RoomManager take these explicitly, so the defaults live here rather than in
  // production code; they mirror application.conf, and a case wanting a short one says so.
  val testGracePeriod: FiniteDuration   = 6.seconds
  val testStopAfterIdle: FiniteDuration = 2.hours

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
    def joinMessage: Room.Join = Room.Join(id, name, token, ref)

  def withUsers(users: Attendee*): RoomData =
    RoomData.of(
      state = Room.RoomState("", Room.Round(estimatesFor(users*), revealed = false)),
      members = users.map(u => u.id -> Room.Member(u.name)).toMap,
      sessions = sessionsFor(users*),
      connections = users.map(u => u.id -> Set(u.ref)).toMap
    )

  extension (data: RoomData)
    def withIssue(issue: String): RoomData =
      RoomData.of(
        data.state.copy(currentIssue = issue),
        data.members,
        data.sessions,
        data.connections
      )

    def withRevealed(): RoomData =
      RoomData.of(
        withRound(data, _.copy(revealed = true)),
        data.members,
        data.sessions,
        data.connections
      )

    // A session whose member has gone or has not yet arrived; both reach the same state.
    def withMemberlessSession(users: Attendee*): RoomData =
      RoomData.of(data.state, data.members, data.sessions ++ sessionsFor(users*), data.connections)

    def withEstimate(user: Attendee): RoomData =
      RoomData.of(
        withRound(data, r => r.copy(estimates = r.estimates ++ estimatesFor(user))),
        data.members,
        data.sessions,
        data.connections
      )

    // The replacement tab arriving before the frozen one drops, and the two-tab case.
    def withSecondConnection(user: Attendee, ref: UntypedRef): RoomData =
      RoomData.of(
        data.state,
        data.members,
        data.sessions,
        data.connections.updatedWith(user.id)(refs => Some(refs.getOrElse(Set.empty) + ref))
      )

    // Inside the grace period: the row survives, the sends do not.
    def withNoConnection(user: Attendee): RoomData =
      RoomData.of(data.state, data.members, data.sessions, data.connections - user.id)

    // Membership ended while the tab is still attached, which is step 6's leave endpoint.
    def withDeparted(user: Attendee): RoomData =
      RoomData.of(data.state, data.members - user.id, data.sessions, data.connections)

    def estimateFor(user: Attendee): Option[(String, Boolean)] =
      data.state.round.estimates.get(user.id).map(e => (e.value, e.confirmed))
  end extension

  private def withRound(data: RoomData, f: Room.Round => Room.Round): Room.RoomState =
    data.state.copy(round = f(data.state.round))

  private def sessionsFor(users: Attendee*): Map[Room.SessionToken, Room.Session] =
    users.map(u => u.token -> Room.Session(u.id, u.name)).toMap

  private def estimatesFor(users: Attendee*): Map[UUID, Room.Estimate] =
    // A blank estimation is no entry at all, but voting for one is an illegal state
    // the fixture refuses rather than quietly rewrites into a non-voter.
    users.foreach(u =>
      require(!(u.voted && u.estimation.isBlank), s"${u.name} voted with no estimation")
    )
    users
      .filterNot(_.estimation.isBlank)
      .map(u => u.id -> Room.Estimate.of(u.estimation, u.voted))
      .toMap
  end estimatesFor
end RoomDataFixtures
