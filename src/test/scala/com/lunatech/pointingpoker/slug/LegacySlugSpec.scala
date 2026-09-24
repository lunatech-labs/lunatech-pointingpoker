package com.lunatech.pointingpoker.slug

import java.util.UUID

import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

class LegacySlugSpec extends AnyWordSpec with must.Matchers:

  private val fixed = UUID.fromString("123e4567-e89b-12d3-a456-426614174000")

  "LegacySlug.derive" should {
    "map one UUID to one slug" in {
      val uuid = UUID.randomUUID()
      LegacySlug.derive(uuid) mustBe LegacySlug.derive(uuid)
    }
    "derive only slugs the parser accepts" in
      (1 to 1000).foreach { _ =>
        val slug = LegacySlug.derive(UUID.randomUUID())
        Slug.parse(slug.raw) mustBe Some(slug)
      }
    // Pinned as hash values rather than words: a vocabulary edit may move a UUID, a new JVM may not.
    "hash nothing that varies between processes" in
      (LegacySlug.hashes(fixed) mustBe (543537963, 536353974, -1881308117))
    "pick each word by its own pool's size" in {
      val (c, a, n) = LegacySlug.hashes(fixed)
      LegacySlug.derive(fixed) mustBe Slug.of(
        Vocabulary.character(Math.floorMod(c, Vocabulary.character.size)),
        Vocabulary.appearance(Math.floorMod(a, Vocabulary.appearance.size)),
        Vocabulary.animal(Math.floorMod(n, Vocabulary.animal.size))
      )
    }
  }
end LegacySlugSpec
