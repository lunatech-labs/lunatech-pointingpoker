package com.lunatech.pointingpoker.slug

import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

class SuggestionSpec extends AnyWordSpec with must.Matchers:

  private def suggest(raw: String) = Suggestion.suggest(raw).map(_.raw)

  "Suggestion.suggest" should {
    "correct one word within one edit" in
      (suggest("brave-golden-oter") mustBe Some("brave-golden-otter"))
    "correct an adjacent swap" in (suggest("brave-golden-otetr") mustBe Some("brave-golden-otter"))
    "correct a typo in more than one word" in
      (suggest("bravo-goldn-otter") mustBe Some("brave-golden-otter"))
    "read the name in lower case" in
      (suggest("Brave-Golden-Oter") mustBe Some("brave-golden-otter"))
    "put back two words given in each other's pools" in {
      suggest("golden-brave-otter") mustBe Some("brave-golden-otter")
      suggest("brave-otter-golden") mustBe Some("brave-golden-otter")
    }
    // gool is one edit from both cool and good, so any guess could land someone in the wrong room.
    "offer nothing when a word is near two pool words" in (suggest("gool-golden-otter") mustBe None)
    "offer nothing for a name near no pool word" in (suggest("nothing-like-this") mustBe None)
    "offer nothing for the wrong number of words" in {
      suggest("brave-otter") mustBe None
      suggest("probe") mustBe None
    }
  }
end SuggestionSpec
