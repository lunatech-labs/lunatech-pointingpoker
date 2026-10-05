package com.lunatech.pointingpoker

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import sttp.tapir.{Schema, ValidationResult, Validator}

import com.lunatech.pointingpoker.actors.Room
import com.lunatech.pointingpoker.RoleWire.given

// The wire's names for a role, for both requests that carry one.
object RoleWire:
  // Explicit tags rather than toString: renaming a case must not silently rename the wire.
  private def tag(role: Room.Role): String = role match
    case Room.Role.Voter       => "Voter"
    case Room.Role.Facilitator => "Facilitator"

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
