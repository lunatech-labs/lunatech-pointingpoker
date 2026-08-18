package com.lunatech.pointingpoker

import io.circe.{Decoder, Encoder}
import io.circe.parser.decode
import io.circe.syntax.*
import org.apache.pekko.http.scaladsl.marshalling.{Marshaller, ToEntityMarshaller}
import org.apache.pekko.http.scaladsl.model.{ContentTypeRange, MediaTypes}
import org.apache.pekko.http.scaladsl.unmarshalling.{FromEntityUnmarshaller, Unmarshaller}

object CirceSupport:

  given circeUnmarshaller[T](using decoder: Decoder[T]): FromEntityUnmarshaller[T] =
    Unmarshaller.stringUnmarshaller
      .forContentTypes(ContentTypeRange(MediaTypes.`application/json`))
      .map(body => decode[T](body).fold(throw _, identity))

  given circeMarshaller[T](using encoder: Encoder[T]): ToEntityMarshaller[T] =
    Marshaller.stringMarshaller(MediaTypes.`application/json`).compose(_.asJson.noSpaces)

end CirceSupport
