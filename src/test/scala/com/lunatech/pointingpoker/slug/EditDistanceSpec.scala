package com.lunatech.pointingpoker.slug

import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

class EditDistanceSpec extends AnyWordSpec with must.Matchers:

  "EditDistance" should {
    "be zero for the same word" in (EditDistance("otter", "otter") mustBe 0)
    "count one substitution, insertion or deletion as one edit" in {
      EditDistance("mole", "vole") mustBe 1
      EditDistance("oter", "otter") mustBe 1
      EditDistance("otterr", "otter") mustBe 1
    }
    // The commonest typing slip, so the suggestion must see it as one edit.
    "count a swap of two adjacent letters as one edit" in (EditDistance("otetr", "otter") mustBe 1)
    "count two edits as two" in (EditDistance("cool", "good") mustBe 2)
    "count every letter against the empty string" in (EditDistance("", "owl") mustBe 3)
  }
end EditDistanceSpec
