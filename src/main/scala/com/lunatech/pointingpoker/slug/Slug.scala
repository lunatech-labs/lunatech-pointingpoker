package com.lunatech.pointingpoker.slug

import java.security.SecureRandom

// Three pool words in order, lowercase. Outside this package only parse, generate and
// LegacySlug.derive make one.
opaque type Slug = String

object Slug:

  private val characters  = Vocabulary.character.toSet
  private val appearances = Vocabulary.appearance.toSet
  private val animals     = Vocabulary.animal.toSet

  // Unpredictable, since a guessable next slug would narrow what a prober has to try.
  val secureRandom: java.util.Random = new SecureRandom()

  def parse(raw: String): Option[Slug] =
    raw.split("-", -1) match
      case Array(c, a, n) if characters(c) && appearances(a) && animals(n) => Some(raw)
      case _                                                               => None

  // At 90% of names live, 100 draws all hit one about 3 times in 100,000.
  private[slug] val MaxDraws = 100

  // None when every draw hit a live room: exhaustion is scale or an abused create-room.
  def generate(isLive: Slug => Boolean, random: java.util.Random): Option[Slug] =
    Iterator.continually(draw(random)).take(MaxDraws).find(slug => !isLive(slug))

  private def draw(random: java.util.Random): Slug =
    of(
      pick(Vocabulary.character, random),
      pick(Vocabulary.appearance, random),
      pick(Vocabulary.animal, random)
    )

  private def pick(pool: Vector[String], random: java.util.Random): String =
    pool(random.nextInt(pool.size))

  private[slug] def of(character: String, appearance: String, animal: String): Slug =
    s"$character-$appearance-$animal"

  extension (slug: Slug) def raw: String = slug
end Slug
