# Step 7: Slug Room Ids Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw UUID room ids with three-word slugs (`brave-golden-otter`) drawn from a reviewed vocabulary, refuse names outside it with a suggestion, and redirect existing UUID links to a derived slug with a banner.

**Architecture:** A new `com.lunatech.pointingpoker.slug` package owns everything about names: the three pools, an opaque `Slug` type whose only constructors are the parser and the generator, the typo suggestion, and the removable UUID derivation. The backend then carries `Slug` where it carried `UUID` for rooms, so an invalid name can never reach `RoomManager`. `PageRoutes` gains the UUID redirect, the lowercase redirect and the rejection page, and moves to the end of the assembled route because its slug matcher takes every single-segment `GET`. The page gains the banner and sends a refused `/join` back through the page route.

**Tech Stack:** Scala 3.9.0 with `-Werror`, Pekko 1.7.0 typed actors, Pekko HTTP 1.4.0, tapir 1.13.31, ScalaTest 3.2.20, logback 1.6.3, Vue 2.6 in `index.html`, Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`: "Slug allocation" (section 3), "Step 7. Slug room ids." (in "The ordered path"), and the step 7 paragraph of the test inventory (section 6).

## Decisions this plan takes that the spec does not settle

Each one is my recommendation. The plan implements it as written unless the review changes it, and Task 8 records it in the design.

- **D1. `RoomState` still gets no `slug` field.** Step 4's note says step 7 adds it "when slug generation gives it a meaning". The reason step 4 gave for leaving it out still holds: `roomId` is already a parameter of `Room.receiveBehaviour`, so a copy in the state would have no reader and could only disagree with the parameter. Task 6 changes the parameter's type to `Slug` and adds no field. Task 8 corrects the step 4 annotation and records this in step 7's "Landed." note.
- **D2. The page can send an invalid name to the API, and the spec says it never does.** The spec says "the page never produces one in normal use". Two paths contradict that. One is the Join form's typed room id. The other is a UUID in `localStorage` from before the cutover, which `created()` rejoins when someone opens `/`. Both would end on "Could not join the room". Task 7 makes a `404` from `/join` navigate to `/<name>`, so the page route's refusal, lowercase redirect or UUID redirect handles it. Task 8 corrects the spec's sentence.
- **D3. "Within one edit" includes a swap of two adjacent letters.** Technically that is optimal string alignment distance 1, so `otetr` suggests `otter`. The near-twin test uses the same function, so the uniqueness the suggestion relies on still holds by construction. With plain Levenshtein, the commonest typing slip would get no suggestion. Task 8 adds the definition to the spec.
- **Factual correction, no decision: tapir answers `400`, not `404`.** A measurement on the current tree showed that `POST /rooms/not-a-uuid/join` answers `400 Invalid value for: path parameter roomId`. The spec's "tapir's own `404`" is wrong as written. Task 6 marks the room path input `.onDecodeFailureNextEndpoint`. A second measurement confirmed that this makes all three endpoint shapes fall through to Pekko's `404`. Task 8 corrects the spec's wording.

Smaller calls, noted so a reviewer can object:

- The mixed-case redirect uses `302`, the same reasoning as the UUID redirect. The query string is dropped, since nothing the server issues carries one on a mixed-case name.
- The banner is fixed to the bottom of the viewport with `role="status"`. In-flow alerts above the room, like today's error and clipboard ones, would push the deck down. `role="status"` also keeps it out of the e2e `connectionAlert` fixture, which matches any `alert`.
- Slugs are drawn with `SecureRandom`, since a predictable next slug would narrow what a prober has to try.
- The Join form's room id input gets `v-model.trim`, so a pasted name with a trailing space is not refused.

## Global Constraints

- Branch: `20260831.protocol_architecture_7_slug_room_ids`, already created off `main` at `73467cc` and carrying the spec commit `3c51c51`. Work on it directly.
- Namespace floor: **200,000**, "stated as a floor rather than an estimate". The test computes the product of the pool sizes.
- Word rules from the spec: "common English at about CEFR A2 to B1, 3 to 8 letters, lowercase ASCII and singular, with one spelling across British and American English, no homophone and no silent letter". Character words are "positive traits, with no double meanings". Appearance words are "colours, patterns and sizes, with no body words". Animals exclude "any used as an insult, any with a sexual slang meaning, and every primate".
- Tests enforce what is mechanical: "lowercase ASCII, no word in two pools, no two words in one pool within one edit of each other, and the namespace floor".
- UUID redirect: "`GET /<uuid>` answers `302` to `/<derived-slug>?moved=1`". "Only the page route knows UUIDs; the API, the cookie path and `RoomManager` see slugs only". "Each redirect logs one INFO line carrying the derived slug and no participant name".
- Route order: the slug matcher "must come last, after `create-room`, after the UUID redirect and after whatever static route step 8's bundled assets need".
- The cookie path becomes `/rooms/<slug>`. No other cookie attribute changes.
- `scalacOptions += "-Werror"` is on for `Compile` and `Test`. A refutable pattern in a `val`, a non-exhaustive match or a deprecation fails the build. `-Wunused` is not on.
- `.scalafmt.conf` has `project.git = true`, so `scalafmtAll` and `scalafmtCheckAll` only see files git knows about. **`git add` every new file before running either.**
- CI runs `sbt qa`, `sbt styleCheck`, `npm test` and `npm run e2e`. All four must be green at the end.
- Code comments are one or two lines, never more. Documents contain no em dash. Commits use Conventional Commits and carry no Claude Code attribution line.
- In docs, cite symbols, not line numbers.

## Review Focus

- **A name typed into the Join form, or a UUID remembered in `localStorage` from before the cutover.** Both go straight to `/join` without passing the page route. A person expects to land on the refusal or on their old room, not on "Could not join the room". Task 7 has an e2e case for each.
- **Markup in the address bar.** The rejection page echoes whatever segment was typed. A person expects the page to show the text, never run it. Task 5 has a case that sends an `<img onerror>` segment and asserts it comes back escaped.
- **The moved banner over the deck.** A fixed banner could cover the cards on a short viewport, and an in-flow one would shift them. A person expects to vote with the banner still up. Task 7 votes with the banner shown and asserts the card's position is unchanged after dismissal.
- **`create-room` drawing a slug that a live room holds.** One collision means two teams share one room. A person expects a fresh room every time. Task 6 has a case that scripts the first draw onto a live room and asserts the manager draws again.
- **A UUID link that a mail client or wiki rewrote in upper case.** A person expects it to open the same room as the lowercase link. Task 5 has a case asserting that both give the same derived slug.

---

## File Structure

| File | Responsibility |
|---|---|
| Create `src/main/scala/com/lunatech/pointingpoker/slug/Vocabulary.scala` | The three pools, nothing else |
| Create `src/main/scala/com/lunatech/pointingpoker/slug/EditDistance.scala` | Optimal string alignment distance, shared by the near-twin test and the suggestion |
| Create `src/main/scala/com/lunatech/pointingpoker/slug/Slug.scala` | Opaque `Slug`, `parse`, `generate`, `raw` |
| Create `src/main/scala/com/lunatech/pointingpoker/slug/Suggestion.scala` | The unambiguous correction for a refused name |
| Create `src/main/scala/com/lunatech/pointingpoker/slug/LegacySlug.scala` | UUID to slug derivation. Deleted, together with its route and banner, when the roadmap trigger fires |
| Create `src/test/scala/com/lunatech/pointingpoker/slug/SlugFixtures.scala` | `aSlug()` and `ScriptedRandom` for every spec |
| Create `src/test/scala/com/lunatech/pointingpoker/slug/{Vocabulary,EditDistance,Slug,Suggestion,LegacySlug}Spec.scala` | Unit tests |
| Modify `PageRoutes.scala` | UUID redirect, slug matcher, lowercase redirect, rejection page |
| Modify `API.scala` | `Slug` path codec, fall-through on a decode failure, cookie path, pages last |
| Modify `actors/RoomManager.scala`, `actors/Room.scala`, `sse/SSE.scala` | `Slug` for room ids, generation on `CreateRoom` |
| Modify `src/main/resources/pages/index.html` | Banner, `404` from `/join` goes through the page route, trim |
| Create `e2e/slug.spec.js`, modify `e2e/fixtures.js` | Browser cases |
| Modify `APISpec.scala`, `RoomManagerSpec.scala`, `RoomSpec.scala`, `SSESpec.scala` | Room ids become slugs; new route and manager cases |
| Modify the design, `README.md`, `docs/roadmap.md`, `docs/known-issues.md` | Task 8 |

---

### Task 1: Vocabulary and edit distance

**Files:**
- Create: `src/main/scala/com/lunatech/pointingpoker/slug/Vocabulary.scala`
- Create: `src/main/scala/com/lunatech/pointingpoker/slug/EditDistance.scala`
- Test: `src/test/scala/com/lunatech/pointingpoker/slug/EditDistanceSpec.scala`
- Test: `src/test/scala/com/lunatech/pointingpoker/slug/VocabularySpec.scala`

**Interfaces:**
- Consumes: nothing.
- Produces: `Vocabulary.character`, `Vocabulary.appearance` and `Vocabulary.animal`, each a `Vector[String]` in alphabetical order. `EditDistance(a: String, b: String): Int`.

The lists below are a checked draft. A script confirmed the mechanical rules on them and a product of 75 × 45 × 79 = 266,625. The rules no test can check (CEFR level, homophones, silent letters, false friends) are applied by judgement. The French and Dutch review before merge is where they get checked (see "Before merge"). Some words were left out under those rules, to show how they were applied:
- `calm`: silent l.
- `red` and `blue`: homophones of `read` and `blew`.
- `grey`: spelling differs between British and American English.
- `whale`: homophone of `wail`.
- `horse`: homophone of `hoarse`.
- `bear` and `deer`: homophones.
- `fox` and `wolf`: slang meanings.
- `lovely`: one edit from `lively`.
- `funny`: one edit from `sunny`.
- `hardy`: one edit from `handy`.

- [ ] **Step 1: Write the failing edit-distance test**

```scala
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `sbt "testOnly com.lunatech.pointingpoker.slug.EditDistanceSpec"`
Expected: compilation FAILS with `Not found: EditDistance`.

- [ ] **Step 3: Implement `EditDistance`**

```scala
package com.lunatech.pointingpoker.slug

// Optimal string alignment: an insertion, deletion, substitution or adjacent swap is one edit.
object EditDistance:

  def apply(a: String, b: String): Int =
    val d = Array.tabulate(a.length + 1, b.length + 1)((i, j) => if i == 0 then j else if j == 0 then i else 0)
    for i <- 1 to a.length; j <- 1 to b.length do
      val cost = if a(i - 1) == b(j - 1) then 0 else 1
      d(i)(j) = math.min(math.min(d(i - 1)(j) + 1, d(i)(j - 1) + 1), d(i - 1)(j - 1) + cost)
      if i > 1 && j > 1 && a(i - 1) == b(j - 2) && a(i - 2) == b(j - 1) then
        d(i)(j) = math.min(d(i)(j), d(i - 2)(j - 2) + 1)
    d(a.length)(b.length)
```

- [ ] **Step 4: Run it to verify it passes**

Run: `sbt "testOnly com.lunatech.pointingpoker.slug.EditDistanceSpec"`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing vocabulary test**

```scala
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
    "hold only lowercase ASCII words of 3 to 8 letters" in
      for (name, pool) <- pools; word <- pool do
        withClue(s"$name: ")(word must fullyMatch regex "[a-z]{3,8}")
    "hold each word once across all three pools" in {
      val all = pools.flatMap(_._2)
      all.diff(all.distinct) mustBe empty
    }
    // Load-bearing: the refusal only catches a typo that lands outside the vocabulary.
    "hold no two words in one pool within one edit of each other" in
      for (name, pool) <- pools do
        val twins = pool.combinations(2).collect {
          case Seq(a, b) if EditDistance(a, b) <= 1 => s"$a/$b"
        }
        withClue(s"$name: ")(twins.toList mustBe empty)
    "keep the namespace at or above its floor of 200,000" in
      (Vocabulary.character.size.toLong * Vocabulary.appearance.size * Vocabulary.animal.size
        must be >= 200_000L)
  }
```

- [ ] **Step 6: Run it to verify it fails**

Run: `sbt "testOnly com.lunatech.pointingpoker.slug.VocabularySpec"`
Expected: compilation FAILS with `Not found: Vocabulary`.

- [ ] **Step 7: Write the vocabulary**

```scala
package com.lunatech.pointingpoker.slug

// Rules and review in the design's "Slug allocation"; VocabularySpec enforces the mechanical ones.
object Vocabulary:

  val character: Vector[String] = Vector(
    "active", "agile", "alert", "bold", "brave", "breezy", "bubbly", "careful", "caring",
    "charming", "chatty", "cheerful", "clever", "cool", "curious", "devoted", "dreamy",
    "eager", "fearless", "festive", "fine", "friendly", "generous", "gentle", "gifted",
    "glad", "good", "graceful", "grand", "handy", "happy", "hearty", "helpful", "heroic",
    "hopeful", "humble", "jolly", "joyful", "keen", "kind", "lively", "loving", "loyal",
    "lucky", "merry", "modest", "neat", "nice", "noble", "patient", "peaceful", "playful",
    "polite", "proud", "quick", "quiet", "ready", "relaxed", "sharp", "smart", "smiley",
    "social", "sporty", "steady", "strong", "sturdy", "sunny", "super", "swift", "tidy",
    "true", "trusty", "upbeat", "warm", "witty"
  )

  val appearance: Vector[String] = Vector(
    "amber", "big", "black", "bronze", "brown", "copper", "coral", "dotted", "emerald",
    "giant", "golden", "green", "huge", "jumbo", "large", "lemon", "lime", "little", "long",
    "massive", "mint", "navy", "olive", "orange", "pearl", "pink", "purple", "rosy", "ruby",
    "rusty", "sandy", "short", "silver", "small", "snowy", "speckled", "spotted", "starry",
    "striped", "tall", "tiny", "violet", "white", "yellow", "zigzag"
  )

  val animal: Vector[String] = Vector(
    "anteater", "badger", "beetle", "bison", "buffalo", "canary", "cat", "clam", "crane",
    "cricket", "crow", "dolphin", "dove", "duck", "eagle", "eel", "elephant", "falcon",
    "ferret", "finch", "firefly", "flamingo", "gecko", "giraffe", "goldfish", "gull",
    "hamster", "hawk", "hedgehog", "heron", "herring", "iguana", "jaguar", "kangaroo", "kiwi",
    "koala", "lark", "lion", "lobster", "magpie", "meerkat", "mole", "moth", "mouse",
    "octopus", "orca", "ostrich", "otter", "owl", "oyster", "panda", "panther", "parrot",
    "pelican", "penguin", "pony", "puffin", "puma", "puppy", "rabbit", "reindeer", "robin",
    "rooster", "seahorse", "seal", "snail", "sparrow", "spider", "squid", "starfish", "stork",
    "swan", "tiger", "toucan", "turtle", "walrus", "wombat", "yak", "zebra"
  )
end Vocabulary
```

- [ ] **Step 8: Run it to verify it passes**

Run: `sbt "testOnly com.lunatech.pointingpoker.slug.*"`
Expected: PASS, 9 tests.

- [ ] **Step 9: Prove the near-twin and floor tests can fail**

First, temporarily add `"vole"` to `animal`.
Run: `sbt "testOnly com.lunatech.pointingpoker.slug.VocabularySpec"`
Expected: FAIL naming `mole/vole`.

Then revert `vole` and temporarily cut `animal` down to its first 50 words (75 × 45 × 50 = 168,750). Run the same command.
Expected: the floor case FAILS.

Revert both changes.

- [ ] **Step 10: Format and commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/slug src/test/scala/com/lunatech/pointingpoker/slug
sbt scalafmtAll
git add -u
git commit -m "feat(slug): add the three word pools and the edit distance they are checked with"
```

---

### Task 2: The `Slug` type

**Files:**
- Create: `src/main/scala/com/lunatech/pointingpoker/slug/Slug.scala`
- Create: `src/test/scala/com/lunatech/pointingpoker/slug/SlugFixtures.scala`
- Test: `src/test/scala/com/lunatech/pointingpoker/slug/SlugSpec.scala`

**Interfaces:**
- Consumes: `Vocabulary` (Task 1).
- Produces:
  - `opaque type Slug = String` in package `com.lunatech.pointingpoker.slug`.
  - `Slug.parse(raw: String): Option[Slug]`.
  - `Slug.generate(isLive: Slug => Boolean, random: java.util.Random): Slug`.
  - `Slug.secureRandom: java.util.Random`.
  - `extension (slug: Slug) def raw: String`.
  - `private[slug] Slug.of(character: String, appearance: String, animal: String): Slug`.
  - Test scope: `SlugFixtures.aSlug(): Slug` and `SlugFixtures.ScriptedRandom(indices: Int*)`.

- [ ] **Step 1: Write the fixtures**

```scala
package com.lunatech.pointingpoker.slug

object SlugFixtures:

  def aSlug(): Slug = Slug.generate(_ => false, Slug.secureRandom)

  // Answers nextInt with the given indices in order, so a test chooses every draw.
  final class ScriptedRandom(indices: Int*) extends java.util.Random:
    private val remaining                  = indices.iterator
    override def nextInt(bound: Int): Int = remaining.next()
```

- [ ] **Step 2: Write the failing test**

```scala
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
        val slug = Slug.generate(_ => false, Slug.secureRandom)
        Slug.parse(slug.raw) mustBe Some(slug)
      }
    "draw again until no live room holds the slug" in
      (Slug.generate(_ == nth(0), ScriptedRandom(0, 0, 0, 1, 1, 1)) mustBe nth(1))
  }
```

- [ ] **Step 3: Run it to verify it fails**

Run: `sbt "testOnly com.lunatech.pointingpoker.slug.SlugSpec"`
Expected: compilation FAILS with `Not found: Slug`.

- [ ] **Step 4: Implement `Slug`**

```scala
package com.lunatech.pointingpoker.slug

import java.security.SecureRandom

// Three pool words in order, lowercase. Only parse and generate make one outside this package.
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

  // Live rooms are a few dozen in a namespace of hundreds of thousands, so this rarely loops.
  def generate(isLive: Slug => Boolean, random: java.util.Random): Slug =
    Iterator.continually(draw(random)).find(slug => !isLive(slug)).get

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
```

- [ ] **Step 5: Run it to verify it passes**

Run: `sbt "testOnly com.lunatech.pointingpoker.slug.SlugSpec"`
Expected: PASS, 8 tests.

- [ ] **Step 6: Prove the retry test can fail**

Temporarily change `generate`'s body to `draw(random)`.
Run: `sbt "testOnly com.lunatech.pointingpoker.slug.SlugSpec"`
Expected: "draw again until no live room holds the slug" FAILS.

Revert the change.

- [ ] **Step 7: Format and commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/slug src/test/scala/com/lunatech/pointingpoker/slug
sbt scalafmtAll
git add -u
git commit -m "feat(slug): add the Slug type, its parser and its collision-avoiding generator"
```

---

### Task 3: The suggestion

**Files:**
- Create: `src/main/scala/com/lunatech/pointingpoker/slug/Suggestion.scala`
- Test: `src/test/scala/com/lunatech/pointingpoker/slug/SuggestionSpec.scala`

**Interfaces:**
- Consumes: `Vocabulary`, `EditDistance` (Task 1). `Slug.parse` and `Slug.of` (Task 2).
- Produces: `Suggestion.suggest(raw: String): Option[Slug]`. It is meant for a name that has already failed `Slug.parse`, both as given and lowercased.

The spec's rule: suggest "when every word has exactly one pool word within one edit, or when two words exist but in each other's pools", reading "only the vocabulary". Every expected value below was checked against a simulation of this rule on the Task 1 pools.

- [ ] **Step 1: Write the failing test**

```scala
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
    "read the name in lower case" in (suggest("Brave-Golden-Oter") mustBe Some("brave-golden-otter"))
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `sbt "testOnly com.lunatech.pointingpoker.slug.SuggestionSpec"`
Expected: compilation FAILS with `Not found: Suggestion`.

- [ ] **Step 3: Implement `Suggestion`**

```scala
package com.lunatech.pointingpoker.slug

import java.util.Locale

// Reads the vocabulary only, never which rooms are live, so it tells a prober nothing about rooms.
object Suggestion:

  private val pools = List(Vocabulary.character, Vocabulary.appearance, Vocabulary.animal)

  def suggest(raw: String): Option[Slug] =
    raw.toLowerCase(Locale.ROOT).split("-", -1).toList match
      case words @ List(_, _, _) => nearest(words).orElse(swapped(words))
      case _                     => None

  // Unique because no two words of one pool are within one edit of each other.
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
```

- [ ] **Step 4: Run it to verify it passes**

Run: `sbt "testOnly com.lunatech.pointingpoker.slug.SuggestionSpec"`
Expected: PASS, 8 tests.

- [ ] **Step 5: Prove the ambiguity test can fail**

Temporarily change `nearest`'s pattern to take the first candidate: `words.zip(pools).map((word, pool) => pool.filter(EditDistance(word, _) <= 1).take(1))`.
Run: `sbt "testOnly com.lunatech.pointingpoker.slug.SuggestionSpec"`
Expected: "offer nothing when a word is near two pool words" FAILS.

Revert the change.

- [ ] **Step 6: Format and commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/slug src/test/scala/com/lunatech/pointingpoker/slug
sbt scalafmtAll
git add -u
git commit -m "feat(slug): suggest a correction only when the vocabulary makes it unambiguous"
```

---

### Task 4: The legacy UUID derivation

**Files:**
- Create: `src/main/scala/com/lunatech/pointingpoker/slug/LegacySlug.scala`
- Test: `src/test/scala/com/lunatech/pointingpoker/slug/LegacySlugSpec.scala`

**Interfaces:**
- Consumes: `Vocabulary` (Task 1). `Slug.of` and `Slug.parse` (Task 2).
- Produces: `LegacySlug.derive(uuid: java.util.UUID): Slug`, and `private[slug] LegacySlug.hashes(uuid: UUID): (Int, Int, Int)`.

The spec's rule is "a stable hash of the UUID's bits, modulo each pool's size". It adds: "The same UUID gives the same slug for a given vocabulary, not forever". So the test pins the three hash values, which no vocabulary edit changes, rather than the words, which one may. The expected values were computed independently with Python's `hashlib.sha256` over the UUID's 16 big-endian bytes. If the JVM gives different numbers, the implementation's byte order is wrong; do not edit the constant to match.

- [ ] **Step 1: Write the failing test**

```scala
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `sbt "testOnly com.lunatech.pointingpoker.slug.LegacySlugSpec"`
Expected: compilation FAILS with `Not found: LegacySlug`.

- [ ] **Step 3: Implement `LegacySlug`**

```scala
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

  // SHA-256 rather than hashCode, so the result depends on nothing but the UUID's bits.
  private[slug] def hashes(uuid: UUID): (Int, Int, Int) =
    val bits = ByteBuffer
      .allocate(16)
      .putLong(uuid.getMostSignificantBits)
      .putLong(uuid.getLeastSignificantBits)
      .array()
    val digest = ByteBuffer.wrap(MessageDigest.getInstance("SHA-256").digest(bits))
    (digest.getInt(), digest.getInt(), digest.getInt())
end LegacySlug
```

- [ ] **Step 4: Run it to verify it passes**

Run: `sbt "testOnly com.lunatech.pointingpoker.slug.*"`
Expected: PASS, 29 tests across the five slug specs.

- [ ] **Step 5: Prove the process-independence test can fail**

Temporarily replace the body of `hashes` with `(uuid.hashCode, uuid.hashCode, uuid.hashCode)`.
Run: `sbt "testOnly com.lunatech.pointingpoker.slug.LegacySlugSpec"`
Expected: "hash nothing that varies between processes" FAILS.

Revert the change.

- [ ] **Step 6: Format and commit**

```bash
git add src/main/scala/com/lunatech/pointingpoker/slug src/test/scala/com/lunatech/pointingpoker/slug
sbt scalafmtAll
git add -u
git commit -m "feat(slug): derive a slug from a legacy UUID, stable for a given vocabulary"
```

---

### Task 5: Page routes

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/PageRoutes.scala` (whole file)
- Modify: `src/main/scala/com/lunatech/pointingpoker/API.scala` (`val route`)
- Test: `src/test/scala/com/lunatech/pointingpoker/APISpec.scala`

**Interfaces:**
- Consumes: `Slug.parse`, `raw` (Task 2), `Suggestion.suggest` (Task 3), `LegacySlug.derive` (Task 4), `SlugFixtures.aSlug` (Task 2).
- Produces:
  - `GET /<slug>` serves the index.
  - `GET /<Mixed-Case>` answers `302` to the lowercase form.
  - Any other `GET /<segment>` answers `404` with the HTML rejection page.
  - `GET /<uuid>` answers `302` to `/<derived>?moved=1`.
  - `API.route` becomes `concat(ProbeRoutes, tapir endpoints, PageRoutes)`.

The API still expects UUIDs until Task 6. This task only touches the page half, plus the one existing test that loads the index under a room path.

- [ ] **Step 1: Point the existing revalidation case at a slug**

In `APISpec`'s "revalidate the index page on every load", the second request is `Get(s"/$roomId")`, where `roomId` is still a UUID string. A UUID now redirects rather than serving the index. Change that request to:

```scala
      Get(s"/${aSlug().raw}") ~> apiRoute ~> check {
```

Add these imports to `APISpec`:

```scala
import java.util.Locale

import ch.qos.logback.classic.Logger as LogbackLogger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.lunatech.pointingpoker.slug.LegacySlug
import com.lunatech.pointingpoker.slug.SlugFixtures.aSlug
import org.apache.pekko.http.scaladsl.model.headers.Location
import org.slf4j.LoggerFactory

import scala.jdk.CollectionConverters.*
```

- [ ] **Step 2: Write the failing route cases**

Add this helper to `APISpec`, below `json`:

```scala
  // PageRoutes logs through slf4j rather than an actor, so its lines are captured off logback.
  private def pageLog[A](body: => A): List[(String, String)] =
    val appender = ListAppender[ILoggingEvent]()
    val logger   = LoggerFactory.getLogger(classOf[PageRoutes]).asInstanceOf[LogbackLogger]
    appender.start()
    logger.addAppender(appender)
    try
      body
      appender.list.asScala.toList.map(e => (e.getLevel.toString, e.getFormattedMessage))
    finally logger.detachAppender(appender)
```

Add these cases inside `"API" should { ... }`, after "revalidate the index page on every load":

```scala
    "serve the index under a room name" in {
      val index = Source.fromFile("src/main/resources/pages/index.html").mkString
      Get(s"/${aSlug().raw}") ~> apiRoute ~> check {
        status mustBe StatusCodes.OK
        responseAs[String] mustBe index
      }
    }
    // The case is deliberate rather than the typo, so it is corrected rather than refused.
    "redirect a room name in mixed case to its lowercase form" in
      Get("/Brave-Golden-Otter") ~> apiRoute ~> check {
        status mustBe StatusCodes.Found
        header[Location].map(_.uri.toString) mustBe Some("/brave-golden-otter")
      }
    "refuse a name outside the vocabulary with a page suggesting the correction" in
      Get("/brave-golden-oter") ~> apiRoute ~> check {
        status mustBe StatusCodes.NotFound
        contentType mustBe ContentTypes.`text/html(UTF-8)`
        val page = responseAs[String]
        page must include("<code>brave-golden-oter</code> is not a room name.")
        page must include("""Did you mean <a href="/brave-golden-otter">brave-golden-otter</a>?""")
        page must include("""<a href="/">Create a room</a>""")
      }
    "refuse a name near no room name without a suggestion" in
      Get("/nothing-like-this") ~> apiRoute ~> check {
        status mustBe StatusCodes.NotFound
        responseAs[String] must not include "Did you mean"
      }
    "escape the refused name before echoing it" in
      Get("/%3Cimg%20src=x%20onerror=alert(1)%3E") ~> apiRoute ~> check {
        status mustBe StatusCodes.NotFound
        val page = responseAs[String]
        page must include("&lt;img src=x onerror=alert(1)&gt;")
        page must not include "<img"
      }
    "redirect a legacy UUID link to its derived room, flagged as moved, and log it once" in {
      val uuid = UUID.fromString("123e4567-e89b-12d3-a456-426614174000")
      val slug = LegacySlug.derive(uuid)
      pageLog {
        Get(s"/$uuid") ~> apiRoute ~> check {
          status mustBe StatusCodes.Found
          header[Location].map(_.uri.toString) mustBe Some(s"/${slug.raw}?moved=1")
        }
      } mustBe List(("INFO", s"Redirecting a legacy room link to ${slug.raw}"))
    }
    // Mail clients and wikis have been seen to upper-case a pasted link.
    "derive the same room for a legacy link in upper case" in {
      val uuid = UUID.fromString("123e4567-e89b-12d3-a456-426614174000")
      Get(s"/${uuid.toString.toUpperCase(Locale.ROOT)}") ~> apiRoute ~> check {
        header[Location].map(_.uri.toString) mustBe Some(s"/${LegacySlug.derive(uuid).raw}?moved=1")
      }
    }
```

- [ ] **Step 3: Run them to verify they fail**

Run: `sbt "testOnly com.lunatech.pointingpoker.APISpec"`
Expected: FAIL.
- The room-name, mixed-case, refusal and escaping cases get `404` with Pekko's plain-text body, because `path(JavaUUID)` does not match.
- The two UUID cases get `200` serving the index where they expect `302`.
- The revalidation case gets `404` without `Cache-Control`.

- [ ] **Step 4: Rewrite `PageRoutes`**

Replace the whole file with:

```scala
package com.lunatech.pointingpoker

import java.util.Locale

import org.apache.pekko.http.scaladsl.model.{ContentTypes, HttpEntity, HttpResponse, StatusCodes}
import org.apache.pekko.http.scaladsl.model.headers.`Cache-Control`
import org.apache.pekko.http.scaladsl.model.headers.CacheDirectives.`no-cache`
import org.apache.pekko.http.scaladsl.server.Directives.*
import org.apache.pekko.http.scaladsl.server.Route
import org.apache.pekko.http.scaladsl.server.directives.ContentTypeResolver.Default
import com.lunatech.pointingpoker.config.ApiConfig
import com.lunatech.pointingpoker.slug.{LegacySlug, Slug, Suggestion}
import org.slf4j.{Logger, LoggerFactory}

// The static half stays raw directives: tapir describes what the client calls, not what the
// server hands back off disk.
class PageRoutes(apiConfig: ApiConfig):

  private val log: Logger = LoggerFactory.getLogger(this.getClass)

  // Always revalidate: no-store would re-send the whole page where a 304 costs nothing.
  private def revalidated(route: Route): Route = respondWithHeader(`Cache-Control`(`no-cache`))(route)

  private val index: Route = revalidated(getFromFile(apiConfig.indexPath))

  val route: Route =
    concat(
      pathEndOrSingleSlash {
        get {
          log.debug("Index call [{}]", apiConfig.indexPath)
          index
        }
      },
      // Legacy links, removed once six months pass with none logged (docs/roadmap.md).
      path(JavaUUID) { uuid =>
        get {
          val slug = LegacySlug.derive(uuid)
          log.info("Redirecting a legacy room link to {}", slug.raw)
          redirect(s"/${slug.raw}?moved=1", StatusCodes.Found)
        }
      },
      // Matches every single-segment path, so it stays last here and API.route puts pages last.
      path(Segment) { raw =>
        get {
          Slug.parse(raw) match
            case Some(slug) =>
              log.debug("Index call with room id: {}", slug.raw)
              index
            case None =>
              Slug.parse(raw.toLowerCase(Locale.ROOT)) match
                case Some(slug) => redirect(s"/${slug.raw}", StatusCodes.Found)
                case None       => revalidated(complete(notARoom(raw)))
        }
      }
    )

  private def notARoom(raw: String): HttpResponse =
    val suggestion = Suggestion
      .suggest(raw)
      .fold("")(slug => s"""<p>Did you mean <a href="/${slug.raw}">${slug.raw}</a>?</p>""")
    val page =
      s"""<!DOCTYPE html>
         |<html lang="en">
         |<head><meta charset="utf-8"><title>Not a room name</title></head>
         |<body>
         |<p><code>${escape(raw)}</code> is not a room name.</p>
         |$suggestion
         |<p><a href="/">Create a room</a></p>
         |</body>
         |</html>
         |""".stripMargin
    HttpResponse(StatusCodes.NotFound, entity = HttpEntity(ContentTypes.`text/html(UTF-8)`, page))

  // The name is whatever was typed into the address bar.
  private def escape(text: String): String =
    text.flatMap {
      case '&'  => "&amp;"
      case '<'  => "&lt;"
      case '>'  => "&gt;"
      case '"'  => "&quot;"
      case '\'' => "&#39;"
      case c    => c.toString
    }
end PageRoutes

object PageRoutes:
  def apply(apiConfig: ApiConfig): PageRoutes = new PageRoutes(apiConfig)
```

- [ ] **Step 5: Put pages last in the assembled route**

In `API.scala`, replace `val route`'s `concat` with:

```scala
  // Pages last: their slug matcher answers every single-segment GET, so nothing after it is reached.
  val route: Route =
    concat(
      ProbeRoutes(probeConfig).route,
      PekkoHttpServerInterpreter().toRoute(endpoints),
      PageRoutes(apiConfig).route
    )
```

- [ ] **Step 6: Run the suite to verify it passes**

Run: `sbt "testOnly com.lunatech.pointingpoker.APISpec"`
Expected: PASS, every case including the seven new ones. "not expose the proxy probe under the shipped configuration" still passes, since `/probe` now gets the rejection page's `404`.

- [ ] **Step 7: Prove the order and escaping cases can fail**

First, temporarily move the `path(JavaUUID)` block after `path(Segment)` in `PageRoutes`.
Run: `sbt "testOnly com.lunatech.pointingpoker.APISpec"`
Expected: both UUID cases FAIL with `404`.

Then revert that and temporarily replace `escape(raw)` with `raw`. Run the same command.
Expected: the escaping case FAILS.

Revert both changes.

- [ ] **Step 8: Format and commit**

```bash
sbt scalafmtAll
git add -u
git commit -m "feat(pages): serve slugs, refuse other names with a suggestion, redirect UUID links"
```

---

### Task 6: Slugs through the backend

**Files:**
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/RoomManager.scala`: every `roomId: UUID`, `RoomId`, `RoomManagerData`, `receiveBehaviour`, `CreateRoom`, `createRoom`
- Modify: `src/main/scala/com/lunatech/pointingpoker/actors/Room.scala`: `apply` and `receiveBehaviour` parameters
- Modify: `src/main/scala/com/lunatech/pointingpoker/sse/SSE.scala`: `source`'s `roomId`
- Modify: `src/main/scala/com/lunatech/pointingpoker/API.scala`: codec, `roomPath`, `sessionCookie`, `createRoom` logic
- Test: `RoomManagerSpec.scala`, `RoomSpec.scala`, `SSESpec.scala`, `APISpec.scala`

**Interfaces:**
- Consumes: `Slug`, `Slug.generate`, `Slug.secureRandom`, `Slug.parse`, `raw`, `Vocabulary`, `SlugFixtures.aSlug`, `SlugFixtures.ScriptedRandom`.
- Produces:
  - Every `RoomManager` command carries `roomId: Slug`, and `RoomManager.RoomId(value: Slug)`.
  - `RoomManager.receiveBehaviour(data, gracePeriod, stopAfterIdle, random: java.util.Random = Slug.secureRandom)`.
  - `Room(roomId: Slug, ...)` and `SSE.source(roomManager, roomId: Slug, ...)`.
  - The API answers `404` for a room path outside the vocabulary, before `RoomManager` is asked.

Per D1, `RoomData` gains no field.

- [ ] **Step 1: Write the failing manager cases**

In `RoomManagerSpec`, add these imports:

```scala
import org.apache.pekko.actor.testkit.typed.Effect
import org.apache.pekko.actor.testkit.typed.scaladsl.TestInbox
import com.lunatech.pointingpoker.slug.{Slug, Vocabulary}
import com.lunatech.pointingpoker.slug.SlugFixtures.{aSlug, ScriptedRandom}
```

Add these cases after "create room":

```scala
    "create a room under a valid slug, spawned under that name" in {
      val behaviorTestKit = BehaviorTestKit(RoomManager(testGracePeriod, testStopAfterIdle))
      val inbox           = TestInbox[RoomManager.Response]()

      behaviorTestKit.run(RoomManager.CreateRoom(inbox.ref))

      val slug = inbox.receiveMessage() match
        case RoomManager.RoomId(value) => value
      Slug.parse(slug.raw) mustBe Some(slug)
      behaviorTestKit.retrieveAllEffects().collect { case s: Effect.Spawned[?] => s.childName } mustBe
        Seq(slug.raw)
    }

    "create a room under a slug no live room holds" in {
      def nth(i: Int) = Slug
        .parse(s"${Vocabulary.character(i)}-${Vocabulary.appearance(i)}-${Vocabulary.animal(i)}")
        .get
      val live            = testKit.createTestProbe[Room.Command]()
      val behaviorTestKit = BehaviorTestKit(
        RoomManager.receiveBehaviour(
          RoomManagerData(Map(nth(0) -> live.ref)),
          testGracePeriod,
          testStopAfterIdle,
          ScriptedRandom(0, 0, 0, 1, 1, 1)
        )
      )
      val inbox = TestInbox[RoomManager.Response]()

      behaviorTestKit.run(RoomManager.CreateRoom(inbox.ref))

      inbox.receiveMessage() mustBe RoomManager.RoomId(nth(1))
    }
```

- [ ] **Step 2: Write the failing API cases**

In `APISpec`, add `import com.lunatech.pointingpoker.slug.Slug`, then add after "answer 401 for a leave with no session cookie":

```scala
    "answer 404 for a command on a name outside the vocabulary, without asking the manager" in {
      Post("/rooms/brave-golden-oter/show") ~> addHeader(
        Cookie("session", validToken.raw)
      ) ~> apiRoute ~> check {
        status mustBe StatusCodes.NotFound
      }
      commandProbe.expectNoMessage(200.millis)
    }
    // The page route lowercases a mixed-case name; the API has no reason to see one.
    "answer 404 for a join on a name in mixed case" in
      Post("/rooms/Brave-Golden-Otter/join", json(JoinRequest("Alice"))) ~> apiRoute ~> check {
        status mustBe StatusCodes.NotFound
      }
    // Only the page route knows UUIDs.
    "answer 404 for an events stream on a legacy UUID" in
      Get(s"/rooms/${UUID.randomUUID()}/events?connectionId=$connectionId") ~> addHeader(
        Cookie("session", validToken.raw)
      ) ~> apiRoute ~> check {
        status mustBe StatusCodes.NotFound
      }
```

- [ ] **Step 3: Run them to verify they fail**

Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomManagerSpec com.lunatech.pointingpoker.APISpec"`
Expected: compilation FAILS, since `RoomManager.RoomId` takes a `String` and `receiveBehaviour` has no fourth parameter.

- [ ] **Step 4: Change `RoomManager`**

In `RoomManager.scala`:
- Add `import com.lunatech.pointingpoker.slug.Slug`.
- Replace `roomId: UUID` with `roomId: Slug` in `ConnectionCompleted`, `ConnectionFailure`, `ConnectToRoom`, `Vote`, `Depart`, `Show`, `Clear`, `Revote`, `EditIssue`, `RequestSession`, `ValidateToken`, `relay` and `createRoom`. The `userId: UUID` fields stay.
- Make these replacements:

```scala
  case class RoomId(value: Slug) extends Response

  final case class RoomManagerData(rooms: Map[Slug, ActorRef[Room.Command]]):
    def addRoom(roomId: Slug, roomActor: ActorRef[Room.Command]): RoomManagerData =
      this.copy(rooms = this.rooms + (roomId -> roomActor))
  object RoomManagerData:
    val empty: RoomManagerData = RoomManagerData(rooms = Map.empty[Slug, ActorRef[Room.Command]])
```

```scala
  private[actors] def receiveBehaviour(
      data: RoomManagerData,
      gracePeriod: FiniteDuration,
      stopAfterIdle: FiniteDuration,
      random: java.util.Random = Slug.secureRandom
  ): Behavior[Command] =
```

```scala
          case CreateRoom(replyTo) =>
            val roomId    = Slug.generate(data.rooms.contains, random)
            val roomActor = createRoom(roomId, context, gracePeriod, stopAfterIdle)
            val newData   = data.addRoom(roomId, roomActor)

            context.watch(roomActor)
            replyTo ! RoomId(roomId)
            receiveBehaviour(newData, gracePeriod, stopAfterIdle, random)
```

- Pass `random` as the fourth argument in the other two recursive calls: the `RequestSession` fold and the `Terminated` signal handler.
- In `createRoom`, change `name = roomId.toString` to `name = roomId.raw`.

- [ ] **Step 5: Change `Room` and `SSE`**

- In `Room.scala`: add `import com.lunatech.pointingpoker.slug.Slug`. Change `roomId: UUID` to `roomId: Slug` in `apply` and in `receiveBehaviour`. Nothing else in the file names the room id's type.
- In `SSE.scala`: add the same import and change `source`'s `roomId: UUID` to `roomId: Slug`. `userId: UUID` stays.

- [ ] **Step 6: Change `API`**

In `API.scala`:
- Remove `import java.util.UUID`.
- Add these two imports:

```scala
import com.lunatech.pointingpoker.slug.Slug
import sttp.tapir.server.interceptor.decodefailure.DefaultDecodeFailureHandler.OnDecodeFailure.*
```

- Change `sessionCookie(roomId: UUID, ...)` to `sessionCookie(roomId: Slug, ...)`. Its `s"/rooms/$roomId"` needs no change.
- Replace the `roomPath` line with the codec followed by the path. The given must come first, since a class-body given used before its definition is still `null` at initialization:

```scala
  private given Codec[String, Slug, CodecFormat.TextPlain] =
    Codec.string.mapDecode(raw =>
      Slug.parse(raw).map(DecodeResult.Value(_)).getOrElse(DecodeResult.Mismatch("a room name", raw))
    )(_.raw)

  // A name outside the vocabulary names no room, so fall through to 404 rather than tapir's 400.
  private val roomPath = "rooms" / path[Slug]("roomId").onDecodeFailureNextEndpoint
```

- In the `createRoom` server logic, change `.map(_.value)` to `.map(_.value.raw)`.

- [ ] **Step 7: Move the specs onto slugs**

Run from the repo root. The regex keeps the whitespace between `createRoom(` and its argument, so the multi-line calls keep their shape:

```bash
t=src/test/scala/com/lunatech/pointingpoker
perl -0pi -e 's/createRoom\((\s*)UUID\.randomUUID\(\)/createRoom($1aSlug()/g; s/Room\(UUID\.randomUUID\(\), /Room(aSlug(), /g; s/val (roomId|unknownRoomId)(\s*)= UUID\.randomUUID\(\)/val $1$2= aSlug()/g; s/roomId\.toString/roomId.raw/g' \
  $t/actors/RoomSpec.scala $t/actors/RoomManagerSpec.scala $t/sse/SSESpec.scala
```

Then make these by-hand edits:
- `RoomSpec.scala`:
  - Add `import com.lunatech.pointingpoker.slug.Slug` and `import com.lunatech.pointingpoker.slug.SlugFixtures.aSlug`.
  - In the `createRoom` helper, change `roomId: UUID` to `roomId: Slug` and the return type `(UUID, ActorRef[Room.Command])` to `(Slug, ActorRef[Room.Command])`.
- `SSESpec.scala`: add `import com.lunatech.pointingpoker.slug.SlugFixtures.aSlug`.
- `APISpec.scala`:
  - Change `val roomId: String = UUID.randomUUID().toString` to `val roomId: Slug = aSlug()`.
  - In "create a room", change `responseAs[String] mustBe roomId` to `responseAs[String] mustBe roomId.raw`.
  - Replace every `UUID.fromString(roomId)` with `roomId`. There are five, in the vote, show, clear, revote and edit-issue cases.

Run: `sbt Test/compile`
Expected: success. If an error names a `UUID` where a `Slug` is expected, it is a room-id site the regex missed: replace that `UUID.randomUUID()` with `aSlug()`. If an error names a `Slug` where a `UUID` is expected, the regex caught a user id: put `UUID.randomUUID()` back there.

- [ ] **Step 8: Run the whole JVM suite**

Run: `sbt test`
Expected: PASS, every existing case plus the five new ones.

- [ ] **Step 9: Prove the wiring and the fall-through can fail**

First, temporarily change `CreateRoom`'s draw to `Slug.generate(_ => false, random)`.
Run: `sbt "testOnly com.lunatech.pointingpoker.actors.RoomManagerSpec"`
Expected: "create a room under a slug no live room holds" FAILS.

Then revert that and temporarily remove `.onDecodeFailureNextEndpoint`.
Run: `sbt "testOnly com.lunatech.pointingpoker.APISpec"`
Expected: the three new `404` cases FAIL with `400 Bad Request`.

Revert both changes.

- [ ] **Step 10: Format and commit**

```bash
sbt scalafmtAll
git add -u
git commit -m "feat(rooms): carry slugs instead of UUIDs from the API to the room actor"
```

---

### Task 7: The page: banner and refused joins

**Files:**
- Modify: `src/main/resources/pages/index.html`: `<style>`, the Join form's room id input, the end of `#app`, `data`, `doJoin`'s `catch`, and `created()`
- Modify: `e2e/fixtures.js`: add `movedBanner`
- Create: `e2e/slug.spec.js`

**Interfaces:**
- Consumes: Task 5's page route behaviour and Task 6's `404` from `/join`.
- Produces: the `moved` Vue data flag and the banner with `role="status"`, containing the text "old link" and a button named "Dismiss".

- [ ] **Step 1: Add the banner locator to the fixtures**

In `e2e/fixtures.js`, after `ownEstimation`:

```js
// The legacy-link banner, a status rather than an alert so connectionAlert never sees it.
export const movedBanner = page => page.getByRole('status').filter({ hasText: 'old link' })
```

- [ ] **Step 2: Write the failing browser cases**

Create `e2e/slug.spec.js`:

```js
import { test, expect, card, movedBanner, nameInput, ownEstimation, vote } from './fixtures.js'

// No query string: the page removes moved=1 before anyone can copy the address.
const ROOM_URL = /\/[a-z]+-[a-z]+-[a-z]+$/

const joinAs = async (page, name) => {
  await nameInput(page).fill(name)
  await page.getByRole('button', { name: 'Join' }).click()
  await expect(page.getByRole('button', { name: 'Show votes' })).toBeVisible()
}

test('an old UUID link opens its derived room under a banner that leaves the deck alone', async ({
  page,
  origin
}) => {
  await page.goto(`${origin}/${crypto.randomUUID()}`)
  await expect(page).toHaveURL(ROOM_URL)
  await expect(movedBanner(page)).toBeVisible()
  await joinAs(page, 'Alice')

  const shown = await card(page, '5').boundingBox()
  await vote(page, '5')
  await expect(ownEstimation(page)).toHaveText('5')
  await movedBanner(page).getByRole('button', { name: 'Dismiss' }).click()
  await expect(movedBanner(page)).toBeHidden()
  // Fixed to the viewport, so dismissing it moves nothing.
  expect((await card(page, '5').boundingBox()).y).toBe(shown.y)
})

test('a mistyped room name is refused with a suggestion that reaches the room', async ({
  page,
  origin
}) => {
  const response = await page.goto(`${origin}/brave-golden-oter`)
  expect(response.status()).toBe(404)
  await expect(page.getByText('is not a room name')).toBeVisible()
  await page.getByRole('link', { name: 'brave-golden-otter' }).click()
  await expect(page).toHaveURL(`${origin}/brave-golden-otter`)
  await joinAs(page, 'Alice')
})

test('a name typed into the Join form is checked by the page route', async ({ page, origin }) => {
  await page.goto(`${origin}/`)
  await page.getByRole('link', { name: 'Join' }).click()
  await page.locator('#join-roomId').fill('brave-golden-oter')
  await nameInput(page).fill('Alice')
  await page.getByRole('button', { name: 'Join' }).click()
  await expect(page).toHaveURL(`${origin}/brave-golden-oter`)
  await expect(page.getByRole('link', { name: 'brave-golden-otter' })).toBeVisible()
})

test('a room remembered from before the cutover reopens under its derived name', async ({
  page,
  origin
}) => {
  // Seeded on / only: init scripts run on every navigation, and the rejoin rewrites the key.
  await page.addInitScript(legacy => {
    if (location.pathname === '/') {
      localStorage.setItem('roomId', legacy)
      localStorage.setItem('name', 'Alice')
    }
  }, crypto.randomUUID())
  await page.goto(`${origin}/`)
  await expect(page).toHaveURL(ROOM_URL)
  await expect(page.getByRole('button', { name: 'Show votes' })).toBeVisible()
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm run e2e -- e2e/slug.spec.js`
Expected: FAIL.
- The UUID case fails with the URL still ending `?moved=1` and no banner.
- The Join-form and remembered-room cases time out on the URL, stuck on "Could not join the room".
- The suggestion case passes already, since it exercises only Task 5.

- [ ] **Step 4: Add the banner style**

In `index.html`'s `<style>`, after `.feather { ... }`:

```css
      /* Fixed so that neither showing nor dismissing it moves the deck. */
      .moved-banner {
        position: fixed;
        bottom: 1rem;
        left: 50%;
        transform: translateX(-50%);
        width: calc(100% - 2rem);
        max-width: 36rem;
        z-index: 1030;
      }
```

- [ ] **Step 5: Add the banner markup**

In `index.html`, directly after `<!-- Room Content End -->`:

```html
      <div class="alert alert-warning moved-banner" role="status" v-if="moved">
        The old link you followed now opens this address. Please update your invitation or
        bookmark to use it.
        <button type="button" class="close" aria-label="Dismiss" v-on:click="moved = false">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
```

- [ ] **Step 6: Trim the typed room id**

Change the Join form's input from `v-model="roomId"` to `v-model.trim="roomId"`.

- [ ] **Step 7: Add the `moved` flag and read it in `created()`**

In `data`, after `showClipboardHint: false,`, add `moved: false,`.

Replace the first two lines of `created()`:

```js
        // TODO handle possible failure from not valid roomId (not UUID)
        var possibleRoomId = window.location.pathname.split('/')[1]
```

with:

```js
        // Set by the legacy-link redirect; cleared from the address so a copied link is clean.
        if (new URLSearchParams(window.location.search).get('moved') === '1') {
          this.moved = true;
          history.replaceState(null, '', window.location.pathname);
        }
        // The server serves this page only under a valid room name, so the path needs no check.
        var possibleRoomId = window.location.pathname.split('/')[1]
```

- [ ] **Step 8: Send a refused join through the page route**

In `doJoin`, make this the first thing in the `.catch(function (error) {` block:

```js
            // Only a typed or remembered name reaches /join unchecked; the page route answers it.
            if (error.response && error.response.status === 404) {
              localStorage.removeItem("roomId");
              window.location.assign('/' + encodeURIComponent(ref.roomId));
              return;
            }
```

Without `removeItem`, a refused name would bounce every later visit to `/` onto the rejection page.

- [ ] **Step 9: Run the browser cases to verify they pass**

Run: `npm run e2e -- e2e/slug.spec.js`
Expected: PASS, 4 tests on each configured browser.

- [ ] **Step 10: Prove the displacement check can fail**

Temporarily delete `position: fixed;` from `.moved-banner`.
Run: `npm run e2e -- e2e/slug.spec.js -g "old UUID link"`
Expected: FAIL on the final `y` comparison.

Restore the line.

- [ ] **Step 11: Run every suite**

Run: `sbt test && npm test && npm run e2e`
Expected: all PASS. The existing e2e cases use the `room` fixture, which now yields a slug.

- [ ] **Step 12: Commit**

```bash
git add e2e/slug.spec.js
git add -u
git commit -m "feat(page): show the moved-link banner and route a refused join through the page"
```

---

### Task 8: Documents

**Files:**
- Modify: `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`
- Modify: `README.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/known-issues.md`

**Interfaces:**
- Consumes: the landed behaviour from Tasks 1 to 7, and decisions D1 to D3.
- Produces: nothing code depends on.

Prose wraps at about 80 columns in these files, so search for a phrase with whitespace normalised across line breaks, not with a single-line `grep`.

- [ ] **Step 1: Correct "Slug allocation"**

- In "**Tests enforce what is mechanical:**", after "...and the namespace floor below.", add: "One edit is an insertion, a deletion, a substitution or a swap of two adjacent letters, the measure the suggestion below uses too, so a swap typo gets a suggestion and the uniqueness the suggestion relies on still holds."
- Replace the bullet "The API endpoints answer an invalid slug with tapir's own `404`. The page never produces one in normal use, so it needs no message." with:

  "- The API endpoints answer an invalid slug with `404`. tapir's default for a path segment that fails to decode is `400`, so the room path input is marked `onDecodeFailureNextEndpoint` and, with no endpoint left, Pekko answers `404`. The page reaches one only through a name typed into the Join form or a room remembered in `localStorage` from before the cutover, and answers it by navigating to that name, where the page route's refusal, lowercase redirect or UUID redirect applies."

- [ ] **Step 2: Correct the `RoomState` annotation (D1)**

In section 3's state block, replace `// slug arrives at step 7, not with the split: step 4 says why` with `// slug stays Room's parameter rather than a field: steps 4 and 7 say why`.

- [ ] **Step 3: Add step 7's "Landed." note**

After the step 7 paragraph ending "...which is exactly why the trap is invisible until step 8 adds the first local one.", add:

"Landed. The `slug` package holds the three pools, the opaque `Slug` whose only public constructors are `Slug.parse` and `Slug.generate`, the suggestion and `LegacySlug`. Deleting `LegacySlug`, the `path(JavaUUID)` block in `PageRoutes` and the page's `moved` banner is the whole removal the roadmap schedules. `PageRoutes` now comes last in `API.route`, after the tapir endpoints. A room path outside the vocabulary answered `400` from tapir until the input was marked to fall through, which is how the API reaches its `404`. **`RoomState` still carries no `slug`**: step 4's reason held, since `roomId` stays a parameter of `Room.receiveBehaviour` and a copy would have no reader. The page sends a `404` from `/join` back to `/<name>`, since the Join form and a remembered pre-cutover room are the two ways a name reaches the API unchecked. The banner is fixed to the viewport so that it neither covers nor shifts the deck, and it uses `role="status"` so the connection-alert assertions never see it."

- [ ] **Step 4: Extend the test inventory**

In section 6's step 7 paragraph, replace "In the browser it adds two cases: the banner shown, dismissed and its parameter removed with the deck still usable, and the rejection page's suggestion link reaching the room." with:

"In the browser it adds four cases: the banner shown, dismissed and its parameter removed with the deck still usable and unmoved; the rejection page's suggestion link reaching the room; a mistyped name in the Join form reaching the rejection page; and a UUID remembered in `localStorage` reopening under its derived slug."

- [ ] **Step 5: Update `README.md`**

- In the endpoint table, change the `/create-room` description to "Creates a room and returns its name, for example `brave-golden-otter`, as plain text".
- After the paragraph that begins "Command endpoints answer what the room decided", add: "A `{roomId}` that is not three vocabulary words in order answers `404` on every endpoint, before any room is consulted."
- Replace the paragraph "There is also a `GET /{roomId}` route that serves the same frontend index page, so a room link can be shared directly." with: "`GET /{roomId}` serves the same frontend index page, so a room link can be shared directly. A room name in mixed case redirects to its lowercase form, and any other name answers `404` with a page that suggests the intended name when only one is close. `GET /{uuid}`, the pre-slug link form, answers `302` to a room name derived from the UUID with `?moved=1`, which the page turns into a banner asking for the link to be updated. `docs/roadmap.md` schedules its removal."

- [ ] **Step 6: Update the roadmap and the known issue**

- In `docs/roadmap.md`, change the Phase 2 item "- [ ] Slug-based room ids replacing raw UUIDs" to "- [x]". Leave the removal item unchecked.
- In `docs/known-issues.md`'s entry "An unrecognized `roomId` silently creates an empty room":
  - Change "brand-new, empty room under the same UUID" to "brand-new, empty room under the same name".
  - Change "this UUID was never used" and "this UUID was a real room" to "this slug was never used" and "this slug was a real room".
  - Change "Step 7 recovers most of that residual without the record: a name outside the slug vocabulary is refused" to "Step 7 recovered most of that residual without the record: a name outside the slug vocabulary is refused".

- [ ] **Step 7: Check the edits**

```bash
grep -nP "\x{2014}" README.md docs/roadmap.md docs/known-issues.md docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md docs/superpowers/plans/2026-08-31-protocol-architecture-7-slug-room-ids.md
python3 - <<'EOF'
import re
for f in ["README.md", "docs/known-issues.md", "docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md"]:
    text = re.sub(r"\s+", " ", open(f).read())
    for stale in ["tapir's own `404`", "never produces one in normal use", "slug arrives at step 7", "same UUID: no prior"]:
        if stale in text:
            print(f, "still says:", stale)
EOF
```

Expected: no output from either command.

- [ ] **Step 8: Commit**

```bash
git add -u
git commit -m "docs(protocol): record step 7 as landed, with the 400 finding and the join fallback"
```

---

## Before merge

These gates are for the user, not the implementing agent:

- **Vocabulary review.** A native French speaker and a native Dutch speaker review the three pools in `Vocabulary.scala` for false friends and words they would misspell. The spec requires this before step 7 merges. `white`, with its silent-for-most-speakers `h`, is worth putting to them by name. A word removed after review needs only `sbt "testOnly com.lunatech.pointingpoker.slug.*"` to confirm the floor still holds.
- **Deploy timing.** Merging to `main` deploys and ends every live room. Every link issued before the deploy is a UUID, so the redirect is what keeps the invitations working.
