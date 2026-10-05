package com.lunatech.pointingpoker.actors

import java.util.UUID

import scala.concurrent.duration.*

import org.apache.pekko.actor.ActorRef as UntypedRef

import com.lunatech.pointingpoker.actors.Room.RoomData
import com.lunatech.pointingpoker.actors.RoomSnapshot.Estimation

object RoomDataFixtures:

  // Room and RoomManager take these explicitly, so the defaults live here rather than in
  // production code. They only need to outlast a case; nothing checks them against any config.
  val testGracePeriod: FiniteDuration   = 6.seconds
  val testStopAfterIdle: FiniteDuration = 2.hours

  // The page mints one per instance; nothing in production mints one here.
  def newConnectionId(): Room.ConnectionId =
    Room.ConnectionId.parse(UUID.randomUUID().toString).get

  // One person's state groups as a single test record, so a fixture site reads as a
  // participant rather than as an entry in each of three maps.
  final case class Attendee(
      id: UUID,
      name: String,
      voted: Boolean,
      estimation: String,
      ref: UntypedRef,
      token: Room.SessionToken,
      connectionId: Room.ConnectionId = newConnectionId()
  ):
    def joinMessage: Room.Join = Room.Join(id, name, token, connectionId, ref)
  end Attendee

  def withUsers(users: Attendee*): RoomData =
    RoomData.of(
      state = stateFor(users*),
      members = users.map(u => u.id -> Room.Member(u.name)).toMap,
      sessions = sessionsFor(users*),
      connections = users.map(u => u.id -> Map(u.connectionId -> u.ref)).toMap
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
      RoomData.of(
        withSeats(data, _ ++ users.map(_.id -> Room.Seat.Voter(None))),
        data.members,
        data.sessions ++ sessionsFor(users*),
        data.connections
      )

    def withEstimate(user: Attendee): RoomData =
      RoomData.of(
        withSeats(data, _ ++ seatsFor(user)),
        data.members,
        data.sessions,
        data.connections
      )

    // The replacement tab arriving before the frozen one drops, and the two-tab case.
    def withSecondConnection(
        user: Attendee,
        connectionId: Room.ConnectionId,
        ref: UntypedRef
    ): RoomData =
      RoomData.of(
        data.state,
        data.members,
        data.sessions,
        data.connections.updatedWith(user.id)(refs =>
          Some(refs.getOrElse(Map.empty) + (connectionId -> ref))
        )
      )

    // Inside the grace period: the row survives, the sends do not.
    def withNoConnection(user: Attendee): RoomData =
      RoomData.of(data.state, data.members, data.sessions, data.connections - user.id)

    // Membership ended while the tab is still attached: tolerated by of, produced by nothing.
    def withDeparted(user: Attendee): RoomData =
      RoomData.of(data.state, data.members - user.id, data.sessions, data.connections)

    // Voted and estimation cannot say "facilitator", so the seat is set whole.
    def withSeat(user: Attendee, seat: Room.Seat): RoomData =
      RoomData.of(
        withSeats(data, _ + (user.id -> seat)),
        data.members,
        data.sessions,
        data.connections
      )

    // Throws on a missing seat or a facilitator's, so neither ever reads as "no estimate".
    def estimateFor(user: Attendee): Option[(String, Boolean)] =
      data.state.seats(user.id) match
        case Room.Seat.Voter(estimate) => estimate.map(e => (e.value, e.confirmed))
        case Room.Seat.Facilitator     =>
          throw IllegalStateException(s"${user.name} is a facilitator, who holds no estimate")
  end extension

  // The pre-union wire's three fields, rebuilt so behaviour specs need not name every tag.
  extension (participant: RoomSnapshot.Participant)
    def voted: Boolean = participant.estimation match
      case Estimation.Confirmed(_) | Estimation.ConfirmedHidden => true
      case _                                                    => false

    def hasEstimation: Boolean = participant.estimation != Estimation.NoEstimation

    def shown: String = participant.estimation match
      case Estimation.Confirmed(value)   => value
      case Estimation.Unconfirmed(value) => value
      case _                             => ""
  end extension

  // A seat per user and a fresh round, for withUsers and the cases that build a RoomData by hand.
  def stateFor(users: Attendee*): Room.RoomState =
    Room.RoomState("", Room.Round.fresh, seatsFor(users*))

  private def withRound(data: RoomData, f: Room.Round => Room.Round): Room.RoomState =
    data.state.copy(round = f(data.state.round))

  private def withSeats(
      data: RoomData,
      f: Map[UUID, Room.Seat] => Map[UUID, Room.Seat]
  ): Room.RoomState =
    data.state.copy(seats = f(data.state.seats))

  private def sessionsFor(users: Attendee*): Map[Room.SessionToken, Room.Session] =
    users.map(u => u.token -> Room.Session(u.id, u.name)).toMap

  private def seatsFor(users: Attendee*): Map[UUID, Room.Seat] =
    // A blank estimation is a seat with no estimate, but voting for one is an illegal state
    // the fixture refuses rather than quietly rewrites into a non-voter.
    users.foreach(u =>
      require(!(u.voted && u.estimation.isBlank), s"${u.name} voted with no estimation")
    )
    users
      .map(u =>
        u.id -> Room.Seat.Voter(
          Option.unless(u.estimation.isBlank)(Room.Estimate.of(u.estimation, u.voted))
        )
      )
      .toMap
  end seatsFor
end RoomDataFixtures
