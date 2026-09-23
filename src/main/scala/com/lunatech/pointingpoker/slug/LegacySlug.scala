package com.lunatech.pointingpoker.slug

import java.nio.ByteBuffer
import java.security.MessageDigest
import java.util.UUID

// Goes with its route and banner after six months with no redirect logged (docs/roadmap.md).
object LegacySlug:

  def derive(uuid: UUID): Slug =
    val (c, a, n) = hashes(uuid)
    Slug.of(
      Vocabulary.character(Math.floorMod(c, Vocabulary.character.size)),
      Vocabulary.appearance(Math.floorMod(a, Vocabulary.appearance.size)),
      Vocabulary.animal(Math.floorMod(n, Vocabulary.animal.size))
    )

  // SHA-256 for three independent, well-spread ints taken from the UUID's bits alone.
  private[slug] def hashes(uuid: UUID): (Int, Int, Int) =
    val bits = ByteBuffer
      .allocate(16)
      .putLong(uuid.getMostSignificantBits)
      .putLong(uuid.getLeastSignificantBits)
      .array()
    val digest = ByteBuffer.wrap(MessageDigest.getInstance("SHA-256").digest(bits))
    (digest.getInt(), digest.getInt(), digest.getInt())
end LegacySlug
