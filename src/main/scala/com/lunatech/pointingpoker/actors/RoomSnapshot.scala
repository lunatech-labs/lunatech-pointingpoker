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
      estimation: String
  )

  object Participant:
    given Encoder[Participant] = deriveEncoder[Participant]

  given Encoder[RoomSnapshot] = deriveEncoder[RoomSnapshot]

  // forUser is the identity this was built for, so who it was redacted for and who the
  // client thinks it is cannot silently disagree. Step 2 makes the redaction real.
  def of(data: RoomData, forUser: UUID): RoomSnapshot =
    RoomSnapshot(
      you = forUser,
      currentIssue = data.currentIssue,
      votesRevealed = data.revealed,
      users = data.users
        .sortWith((a, b) => a.id.compareTo(b.id) < 0)
        .map(u => Participant(u.id, u.name, u.voted, u.estimation))
    )
end RoomSnapshot
