package com.lunatech.pointingpoker.slug

object SlugFixtures:

  def aSlug(): Slug = Slug.generate(_ => false, Slug.secureRandom).get

  // Always draws the first word of each pool, so every draw names the same room.
  object StuckRandom extends java.util.Random:
    override def nextInt(bound: Int): Int = 0

  // Answers nextInt with the given indices in order, so a test chooses every draw.
  final class ScriptedRandom(indices: Int*) extends java.util.Random:
    private val remaining                 = indices.iterator
    override def nextInt(bound: Int): Int = remaining.next()
end SlugFixtures
