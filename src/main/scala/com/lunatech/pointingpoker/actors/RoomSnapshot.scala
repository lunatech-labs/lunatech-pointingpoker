package com.lunatech.pointingpoker.actors

import java.util.UUID

import io.circe.Encoder
import io.circe.generic.semiauto.deriveEncoder

import com.lunatech.pointingpoker.actors.Room.RoomData

final case class RoomSnapshot(
    you: UUID,
    currentIssue: String,
    votesRevealed: Boolean,
    users: List[RoomSnapshot.Participant]
)

object RoomSnapshot:

  // A projection rather than Room.User: a derived encoder over the domain type would put
  // every participant's session token on the wire to every other participant.
  final case class Participant(
      id: UUID,
      name: String,
      voted: Boolean,
      hasEstimation: Boolean,
      estimation: String
  )

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
      // The join: a participant appears because they are one, their estimate comes from
      // the round, and an estimate belonging to nobody present reaches nobody.
      users = data.users
        .sortWith((a, b) => a.id.compareTo(b.id) < 0)
        .map { u =>
          val estimate = round.estimates.get(u.id)
          val disclose = round.revealed || u.id == forUser
          Participant(
            id = u.id,
            name = u.name,
            voted = estimate.exists(_.confirmed),
            hasEstimation = estimate.isDefined,
            estimation = estimate.filter(_ => disclose).map(_.value).getOrElse("")
          )
        }
    )
  end of
end RoomSnapshot
