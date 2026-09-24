package com.lunatech.pointingpoker.slug

import java.util.UUID

import com.lunatech.pointingpoker.slug.SlugFixtures.ScriptedRandom
import org.scalatest.matchers.must
import org.scalatest.wordspec.AnyWordSpec

class SlugSpec extends AnyWordSpec with must.Matchers:

  private def nth(i: Int): Slug =
    Slug.of(Vocabulary.character(i), Vocabulary.appearance(i), Vocabulary.animal(i))

  "Slug.parse" should {
    "accept three pool words in order" in
      (Slug.parse("brave-golden-otter").map(_.raw) mustBe Some("brave-golden-otter"))
    "refuse the pools out of order" in (Slug.parse("golden-brave-otter") mustBe None)
    "refuse a word outside its pool" in (Slug.parse("brave-golden-oter") mustBe None)
    // The page route redirects this case; the API codec refuses it.
    "refuse upper case" in (Slug.parse("Brave-Golden-Otter") mustBe None)
    "refuse the wrong number of words" in {
      Slug.parse("brave-otter") mustBe None
      Slug.parse("brave-golden-otter-cat") mustBe None
      Slug.parse("brave-golden-otter-") mustBe None
      Slug.parse("") mustBe None
    }
    "refuse a legacy UUID" in (Slug.parse(UUID.randomUUID().toString) mustBe None)
  }

  "Slug.generate" should {
    "draw only slugs the parser accepts" in
      (1 to 200).foreach { _ =>
        val slug = Slug.generate(_ => false, Slug.secureRandom).get
        Slug.parse(slug.raw) mustBe Some(slug)
      }
    "draw again until no live room holds the slug" in
      (Slug.generate(_ == nth(0), ScriptedRandom(0, 0, 0, 1, 1, 1)) mustBe Some(nth(1)))
    "give up after MaxDraws draws that all hit a live room" in {
      var draws                              = 0
      def everyNameLive(slug: Slug): Boolean =
        draws += 1
        true
      Slug.generate(everyNameLive, Slug.secureRandom) mustBe None
      draws mustBe Slug.MaxDraws
    }
  }
end SlugSpec
