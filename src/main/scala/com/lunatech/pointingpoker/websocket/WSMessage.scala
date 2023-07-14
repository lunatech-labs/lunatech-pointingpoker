package com.lunatech.pointingpoker.websocket

import java.util.UUID

import com.lunatech.pointingpoker.websocket.WSMessage.MessageType
import io.circe.*

case class WSMessage(
    messageType: MessageType,
    roomId: UUID,
    userId: UUID,
    extra: String
)

object WSMessage:

  val NoExtra = ""

  enum MessageType(val stringRep: String):
    case Init extends MessageType("init")
    case Join extends MessageType("join")
    case Leave extends MessageType("leave")
    case Vote extends MessageType("vote")
    case Show extends MessageType("show")
    case Clear extends MessageType("clear")
    case EditIssue extends MessageType("edit_issue")

  object MessageType:
    import MessageType.*
    def apply(messageType: String): MessageType =
      messageType match
        case Init.stringRep      => Init
        case Join.stringRep      => Join
        case Leave.stringRep     => Leave
        case Vote.stringRep      => Vote
        case Show.stringRep      => Show
        case Clear.stringRep     => Clear
        case EditIssue.stringRep => EditIssue
        case _ => throw new IllegalArgumentException(s"$messageType is not a valid MessageType")

    def unapply(messageType: MessageType): Option[String] =
      messageType match
        case Init      => Option(Init.stringRep)
        case Join      => Option(Join.stringRep)
        case Leave     => Option(Leave.stringRep)
        case Vote      => Option(Vote.stringRep)
        case Show      => Option(Show.stringRep)
        case Clear     => Option(Clear.stringRep)
        case EditIssue => Option(EditIssue.stringRep)
  end MessageType

  given wsMessageDecoder: Decoder[WSMessage] = new Decoder[WSMessage]:
    def apply(c: HCursor): Decoder.Result[WSMessage] = ???
end WSMessage
