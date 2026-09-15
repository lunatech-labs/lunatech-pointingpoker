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
      users = data.members.toList
        .sortWith((a, b) => a._1.compareTo(b._1) < 0)
        .map { (id, member) =>
          val estimate = round.estimates.get(id)
          val disclose = round.revealed || id == forUser
          Participant(
            id = id,
            name = member.name,
            voted = estimate.exists(_.confirmed),
            hasEstimation = estimate.isDefined,
            estimation = estimate.filter(_ => disclose).map(_.value).getOrElse("")
          )
        }
    )
  end of
end RoomSnapshot
