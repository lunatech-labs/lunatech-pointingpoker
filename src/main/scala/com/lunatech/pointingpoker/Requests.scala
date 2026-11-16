package com.lunatech.pointingpoker

import io.circe.{Decoder, DecodingFailure, Encoder, Json}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import sttp.tapir.{Schema, ValidationResult, Validator}
import sttp.tapir.generic.Configuration

import com.lunatech.pointingpoker.actors.{Room, RoomSnapshot}
import com.lunatech.pointingpoker.RoleWire.given

// The role's codecs, for both requests that carry one, named by the snapshot seat's tag.
object RoleWire:
  private def tag(role: Room.Role): String = RoomSnapshot.Seat.tag(role)

  given Encoder[Room.Role] = Encoder.encodeString.contramap(tag)
  // Any other value fails to decode, which tapir answers with 400.
  given Decoder[Room.Role] = Decoder.decodeString.emap(raw =>
    Room.Role.values.find(tag(_) == raw).toRight(s"not a role: $raw")
  )
  given Schema[Room.Role] = Schema.derivedEnumeration[Room.Role](encode = Some(tag))
end RoleWire

case class JoinRequest(name: String, role: Room.Role)
object JoinRequest:
  given Decoder[JoinRequest] = deriveDecoder[JoinRequest]
  given Encoder[JoinRequest] = deriveEncoder[JoinRequest]
  given Schema[JoinRequest]  = Schema.derived[JoinRequest]

case class VoteRequest(estimation: String)
object VoteRequest:
  given Decoder[VoteRequest] = deriveDecoder[VoteRequest]
  given Encoder[VoteRequest] = deriveEncoder[VoteRequest]
  // Refusing the absence of a value, not judging one: the scale item still owns validation.
  given Schema[VoteRequest] = Schema
    .derived[VoteRequest]
    .modify(_.estimation)(
      _.validate(
        Validator.custom(v =>
          if v.isBlank then ValidationResult.Invalid("an estimation needs a value")
          else ValidationResult.Valid
        )
      )
    )
end VoteRequest

case class RoleRequest(role: Room.Role)
object RoleRequest:
  given Decoder[RoleRequest] = deriveDecoder[RoleRequest]
  given Encoder[RoleRequest] = deriveEncoder[RoleRequest]
  given Schema[RoleRequest]  = Schema.derived[RoleRequest]

case class EditIssueRequest(issue: String)
object EditIssueRequest:
  given Decoder[EditIssueRequest] = deriveDecoder[EditIssueRequest]
  given Encoder[EditIssueRequest] = deriveEncoder[EditIssueRequest]
  given Schema[EditIssueRequest]  = Schema.derived[EditIssueRequest]

// The request's choice: Skip moves on and records nothing, so it is no Room.Outcome.
enum Choice:
  case Estimate(value: String)
  case Unsettled
  case Skip

  def recorded: Option[Room.Outcome] = this match
    case Estimate(value) => Some(Room.Outcome.Estimate(value))
    case Unsettled       => Some(Room.Outcome.Unsettled)
    case Skip            => None
end Choice

object Choice:
  // Tagged as the snapshot's entries: explicit tags, so renaming a case cannot rename the wire.
  given Encoder[Choice] = Encoder.instance {
    case Estimate(value) =>
      Json.obj("type" -> Json.fromString("Estimate"), "value" -> Json.fromString(value))
    case Unsettled => Json.obj("type" -> Json.fromString("Unsettled"))
    case Skip      => Json.obj("type" -> Json.fromString("Skip"))
  }
  // Any other type fails to decode, which tapir answers with 400.
  given Decoder[Choice] = Decoder.instance(cursor =>
    cursor.get[String]("type").flatMap {
      case "Estimate"  => cursor.get[String]("value").map(Estimate(_))
      case "Unsettled" => Right(Unsettled)
      case "Skip"      => Right(Skip)
      case other       => Left(DecodingFailure(s"not an outcome: $other", cursor.history))
    }
  )
  given Schema[Choice] =
    given Configuration = Configuration.default.withDiscriminator("type")
    Schema
      .derived[Choice]
      .validate(Validator.custom {
        case Estimate(value) if value.isBlank =>
          ValidationResult.Invalid("an estimate needs a value")
        case _ => ValidationResult.Valid
      })
end Choice

case class NextIssueRequest(round: Int, issue: String, outcome: Choice)
object NextIssueRequest:
  given Decoder[NextIssueRequest] = deriveDecoder[NextIssueRequest]
  given Encoder[NextIssueRequest] = deriveEncoder[NextIssueRequest]
  given Schema[NextIssueRequest]  = Schema.derived[NextIssueRequest]
