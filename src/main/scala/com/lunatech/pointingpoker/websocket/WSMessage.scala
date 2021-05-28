package com.lunatech.pointingpoker.websocket

import java.util.UUID

import com.lunatech.pointingpoker.websocket.WSMessage.MessageType
import play.api.libs.json._

import scala.util.{Failure, Success, Try}

final case class WSMessage(messageType: MessageType, roomId: UUID, userId: UUID, extra: String)

object WSMessage {

  val NoExtra = ""

  sealed trait MessageType {
    val stringRep: String
  }

  object MessageType {
    def apply(messageType: String): MessageType =
      messageType match {
        case Init.stringRep      => Init
        case Join.stringRep      => Join
        case Leave.stringRep     => Leave
        case Vote.stringRep      => Vote
        case Show.stringRep      => Show
        case Clear.stringRep     => Clear
        case EditIssue.stringRep => EditIssue
        case _ => throw new IllegalArgumentException(s"$messageType is not a valid MessageType")
      }

    def unapply(messageType: MessageType): Option[String] =
      messageType match {
        case Init      => Option(Init.stringRep)
        case Join      => Option(Join.stringRep)
        case Leave     => Option(Leave.stringRep)
        case Vote      => Option(Vote.stringRep)
        case Show      => Option(Show.stringRep)
        case Clear     => Option(Clear.stringRep)
        case EditIssue => Option(EditIssue.stringRep)
      }

    final case object Init extends MessageType {
      override val stringRep: String = "init"
    }

    final case object Join extends MessageType {
      override val stringRep: String = "join"
    }

    final case object Leave extends MessageType {
      override val stringRep: String = "leave"
    }

    final case object Vote extends MessageType {
      override val stringRep: String = "vote"
    }

    final case object Show extends MessageType {
      override val stringRep: String = "show"
    }

    final case object Clear extends MessageType {
      override val stringRep: String = "clear"
    }

    final case object EditIssue extends MessageType {
      override val stringRep: String = "edit_issue"
    }

    implicit val messageTypeFormat: Format[MessageType] = Format[MessageType](
      Reads[MessageType] {
        case JsString(value) =>
          Try(MessageType(value)) match {
            case Success(messageType) => JsSuccess(messageType)
            case Failure(exception)   => JsError(exception.toString)
          }
        case _ => JsError("Unexpected type")
      },
      Writes[MessageType] { messageType =>
        JsString(messageType.stringRep)
      }
    )
  }

  implicit val wsMessageFormat: Format[WSMessage] = Json.format[WSMessage]
}
