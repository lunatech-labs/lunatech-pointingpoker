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
    RoomSnapshot(
      you = forUser,
      currentIssue = data.currentIssue,
      votesRevealed = data.revealed,
      users = data.users
        .sortWith((a, b) => a.id.compareTo(b.id) < 0)
        .map { u =>
          val disclose = data.revealed || u.id == forUser
          Participant(
            id = u.id,
            name = u.name,
            voted = u.voted,
            // From the unredacted value: the client's hidden-value icon reads this, not the string.
            hasEstimation = u.estimation.nonEmpty,
            estimation = if disclose then u.estimation else ""
          )
        }
    )
end RoomSnapshot
