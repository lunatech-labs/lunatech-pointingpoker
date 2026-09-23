package com.lunatech.pointingpoker.slug

import java.util.Locale

// Reads the vocabulary only, never which rooms are live, so it tells a prober nothing about rooms.
object Suggestion:

  private val pools = List(Vocabulary.character, Vocabulary.appearance, Vocabulary.animal)

  def suggest(raw: String): Option[Slug] =
    raw.toLowerCase(Locale.ROOT).split("-", -1).toList match
      case words @ List(_, _, _) => nearest(words).orElse(swapped(words))
      case _                     => None

  // None unless every pool yields exactly one candidate; ambiguous words like "gool" must not guess.
  private def nearest(words: List[String]): Option[Slug] =
    words.zip(pools).map((word, pool) => pool.filter(EditDistance(word, _) <= 1)) match
      case List(Vector(c), Vector(a), Vector(n)) => Some(Slug.of(c, a, n))
      case _                                     => None

  // The pools are disjoint, so at most one pair can swap into a valid name.
  private def swapped(words: List[String]): Option[Slug] =
    List((0, 1), (0, 2), (1, 2)).iterator
      .map((i, j) => words.updated(i, words(j)).updated(j, words(i)))
      .flatMap(swap => Slug.parse(swap.mkString("-")))
      .nextOption()
end Suggestion
