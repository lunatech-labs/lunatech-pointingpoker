package com.lunatech.pointingpoker

import java.util.UUID

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import sttp.tapir.{Schema, ValidationResult, Validator}

case class JoinRequest(name: String)
object JoinRequest:
  given Decoder[JoinRequest] = deriveDecoder[JoinRequest]
  given Encoder[JoinRequest] = deriveEncoder[JoinRequest]
  given Schema[JoinRequest]  = Schema.derived[JoinRequest]

case class JoinResponse(userId: UUID)
object JoinResponse:
  given Encoder[JoinResponse] = deriveEncoder[JoinResponse]
  given Decoder[JoinResponse] = deriveDecoder[JoinResponse]
  given Schema[JoinResponse]  = Schema.derived[JoinResponse]

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

case class EditIssueRequest(issue: String)
object EditIssueRequest:
  given Decoder[EditIssueRequest] = deriveDecoder[EditIssueRequest]
  given Encoder[EditIssueRequest] = deriveEncoder[EditIssueRequest]
  given Schema[EditIssueRequest]  = Schema.derived[EditIssueRequest]
