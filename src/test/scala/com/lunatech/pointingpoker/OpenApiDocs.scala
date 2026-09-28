package com.lunatech.pointingpoker

import io.circe.Printer
import io.circe.syntax.*
import sttp.apispec.openapi.circe.*
import sttp.tapir.docs.openapi.OpenAPIDocsInterpreter

import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Paths}

// Writes the OpenAPI document for Endpoints.all; run through the genOpenApi alias.
@main def writeOpenApi(path: String): Unit =
  val docs    = OpenAPIDocsInterpreter().toOpenAPI(Endpoints.all, "Pointing Poker", "1")
  val printer = Printer.spaces2.copy(dropNullValues = true)
  val target  = Paths.get(path).toAbsolutePath
  Files.createDirectories(target.getParent)
  Files.writeString(target, printer.print(docs.asJson) + "\n", StandardCharsets.UTF_8)
  println(s"Wrote $target")
