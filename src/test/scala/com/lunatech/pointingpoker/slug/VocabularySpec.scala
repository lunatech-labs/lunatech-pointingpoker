package com.lunatech.pointingpoker.slug

import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

class VocabularySpec extends AnyWordSpec with must.Matchers:

  private val pools = List(
    "character"  -> Vocabulary.character,
    "appearance" -> Vocabulary.appearance,
    "animal"     -> Vocabulary.animal
  )

  "The slug vocabulary" should {
    "hold only lowercase ASCII words of 3 to 8 letters" in {
      for (name, pool) <- pools; word <- pool do
        withClue(s"$name: ")((word must fullyMatch).regex("[a-z]{3,8}"))
    }
    "hold each word once across all three pools" in {
      val all = pools.flatMap(_._2)
      all.diff(all.distinct) mustBe empty
    }
    // Load-bearing: the refusal only catches a typo that lands outside the vocabulary.
    "hold no two words in one pool within one edit of each other" in {
      for (name, pool) <- pools do
        val twins = pool.combinations(2).collect {
          case Seq(a, b) if EditDistance(a, b) <= 1 => s"$a/$b"
        }
        withClue(s"$name: ")(twins.toList mustBe empty)
    }
    "keep the namespace at or above its floor of 200,000" in
      (Vocabulary.character.size.toLong * Vocabulary.appearance.size * Vocabulary.animal.size
        must be >= 200_000L)
  }
end VocabularySpec
