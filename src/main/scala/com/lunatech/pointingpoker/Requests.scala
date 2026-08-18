package com.lunatech.pointingpoker

import java.util.UUID

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

case class JoinRequest(name: String)
object JoinRequest:
  given Decoder[JoinRequest] = deriveDecoder[JoinRequest]
  given Encoder[JoinRequest] = deriveEncoder[JoinRequest]

case class JoinResponse(userId: UUID)
object JoinResponse:
  given Encoder[JoinResponse] = deriveEncoder[JoinResponse]
  given Decoder[JoinResponse] = deriveDecoder[JoinResponse]

case class VoteRequest(estimation: String)
object VoteRequest:
  given Decoder[VoteRequest] = deriveDecoder[VoteRequest]
  given Encoder[VoteRequest] = deriveEncoder[VoteRequest]

case class EditIssueRequest(issue: String)
object EditIssueRequest:
  given Decoder[EditIssueRequest] = deriveDecoder[EditIssueRequest]
  given Encoder[EditIssueRequest] = deriveEncoder[EditIssueRequest]
