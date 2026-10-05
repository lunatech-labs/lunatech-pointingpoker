package com.lunatech.pointingpoker.actors

import java.util.UUID

import io.circe.{Encoder, Json}
import io.circe.generic.semiauto.deriveEncoder

import com.lunatech.pointingpoker.actors.Room.RoomData

final case class RoomSnapshot(
    you: UUID,
    currentIssue: String,
    votesRevealed: Boolean,
    users: List[RoomSnapshot.Participant]
)

object RoomSnapshot:

  // A projection rather than Room.Member: a derived encoder over the room's own state would
  // put every participant's session token on the wire to every other participant.
  final case class Participant(id: UUID, name: String, seat: Seat)

  // A facilitator's seat has no estimation, so the wire cannot carry one for them.
  enum Seat:
    case Voter(estimation: Estimation)
    case Facilitator

  object Seat:
    // Explicit tags, as Estimation's are.
    given Encoder[Seat] = Encoder.instance {
      case Voter(estimation) =>
        tagged("Voter", "estimation" -> Encoder[Estimation].apply(estimation))
      case Facilitator => tagged("Facilitator")
    }

  private def tagged(tag: String, fields: (String, Json)*): Json =
    Json.obj(("type" -> Json.fromString(tag)) +: fields*)

  // One tag per reachable pair of (confirmed, disclosed), so the wire cannot carry a value
  // alongside a hidden flag, nor a "voted" with no estimation.
  enum Estimation:
    case NoEstimation, ConfirmedHidden, UnconfirmedHidden
    case Confirmed(value: String)
    case Unconfirmed(value: String)

  object Estimation:
    // Explicit tags rather than toString: renaming a case must not silently rename the wire.
    given Encoder[Estimation] = Encoder.instance {
      case NoEstimation       => tagged("NoEstimation")
      case ConfirmedHidden    => tagged("ConfirmedHidden")
      case UnconfirmedHidden  => tagged("UnconfirmedHidden")
      case Confirmed(value)   => tagged("Confirmed", "value" -> Json.fromString(value))
      case Unconfirmed(value) => tagged("Unconfirmed", "value" -> Json.fromString(value))
    }

    def of(estimate: Option[Room.Estimate], disclose: Boolean): Estimation =
      // A tuple rather than guards, so the compiler checks all four pairs are covered.
      estimate.fold(NoEstimation)(e =>
        (e.confirmed, disclose) match
          case (true, true)   => Confirmed(e.value)
          case (true, false)  => ConfirmedHidden
          case (false, true)  => Unconfirmed(e.value)
          case (false, false) => UnconfirmedHidden
      )
  end Estimation

  object Participant:
    given Encoder[Participant] = deriveEncoder[Participant]

  given Encoder[RoomSnapshot] = deriveEncoder[RoomSnapshot]

  // forUser is both the identity this was built for and the only one whose estimation it
  // discloses before the reveal, so redaction and identity cannot disagree.
  def of(data: RoomData, forUser: UUID): RoomSnapshot =
    val round = data.state.round
    RoomSnapshot(
      you = forUser,
      currentIssue = data.state.currentIssue,
      votesRevealed = round.revealed,
      // The join: a participant appears because they are one, their seat is theirs, and an
      // estimate belonging to nobody present reaches nobody.
      users = data.members.toList
        .sortWith((a, b) => a._1.compareTo(b._1) < 0)
        .map { (id, member) =>
          val disclose = round.revealed || id == forUser
          // A member with no seat breaks an invariant, and reads as a voter, as complete counts it.
          val seat = data.state.seats.get(id) match
            case Some(Room.Seat.Voter(e))    => Seat.Voter(Estimation.of(e, disclose))
            case Some(Room.Seat.Facilitator) => Seat.Facilitator
            case None                        => Seat.Voter(Estimation.NoEstimation)
          Participant(id, member.name, seat)
        }
    )
  end of
end RoomSnapshot
