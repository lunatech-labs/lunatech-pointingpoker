# Avatar Emoji

Date: 2026-11-05
Status: Approved
Parent: issue #550

## Purpose

A roster avatar must always draw as one clean line inside its disc, whatever
the browser and its emoji font. Today `A.N.A.S. 🤖` gives `A🤖`, which the
reporter's browser on Windows broke onto two lines (their screenshot), as
Firefox breaks `🍕🎉`: a line may break before an emoji when the pair is wider
than the disc. Two Chinese or Japanese characters break the same way in
Firefox, and wide letters spill past the circle.

What the disc shows stays the person's choice, made by the order of their
name: letters first gives letters, an emoji first gives the emoji. Emoji-only
names (a team's joke) keep their emoji.

Out of scope: the colour hash, the disc's size and the initials' font size.

## Terms

- **Pick**: a word's first grapheme, as `first` in `frontend/src/room/avatar.ts`
  takes it; `first` and the split into words (at spaces and hyphens) are
  unchanged.
- **Emoji pick**: a pick containing a pictograph or a regional indicator
  (`/\p{Extended_Pictographic}|\p{Regional_Indicator}/u`), so emoji, joined
  emoji and flags.

## Behaviour

`initials` takes the picks of the first two words. With no emoji pick it joins
them, uppercased, as today. With an emoji pick among them it returns the first
pick alone.

| Name | Today | After |
|---|---|---|
| `Marie Curie` | `MC` | `MC` |
| `王 小明` | `王小` | `王小` |
| `(Bob) Smith` | `(S` | `(S` |
| `A B 🤖` | `AB` | `AB` |
| `1️⃣ Bob` | `1️⃣B` | `1️⃣B` |
| `A.N.A.S. 🤖` | `A🤖` | `A` |
| `Marie 🇫🇷` | `M🇫🇷` | `M` |
| `(Bob) 🤖` | `(🤖` | `(` |
| `© Corp` | `©C` | `©` |
| `🤖 Anas` | `🤖A` | `🤖` |
| `🍕 🎉` | `🍕🎉` | `🍕` |
| `🦄` | `🦄` | `🦄` |

`.roster-avatar` in `frontend/src/components/roster.css` gains
`white-space: nowrap` and `overflow: clip`: initials never wrap, and what is
wider than the disc is cut at the circle. Initials wider than the disc start at
its left edge and spill right (measured in both browsers), so the clip cuts
their right side.

## Contract

- The roster avatar's span in `Roster.tsx` gains `data-testid="avatar"`
  (decision 5).
- `e2e/fixtures.js` gains a helper for a person's avatar: in the complementary
  region "Participants" (scoped as `facilitatorName` is), the `listitem`
  holding the name, then its `avatar` test id. `participantEntry` cannot host
  it: it reads the Voters table, and a roster row never carries the
  `participant` test id.
- Reads: the client rects of the avatar's text, and `elementFromPoint` on its
  overflow (Verification).

In `docs/design/ui-reference.md`, "Contract reads the look keeps" gains a
pointer to this section, as it points to the tied vote's Contract.

## Docs

- `docs/design/room.html`: its `initials` follows Behaviour, and the comment on
  its `graphemes` line is rewritten to match. Its CSS is `roster.css`, already
  linked.
- `avatar.ts`: the one- or two-line comment above `first` says what an emoji
  pick does now.

## Verification

- Unit, `avatar.test.ts`: every row of the Behaviour table. The existing cases
  "takes an emoji past one UTF-16 unit whole", "takes a flag whole" and "takes
  a joined emoji whole" are rewritten in place to expect the lone pick (`🦊`,
  `🇫🇷`, `🧑‍💻`).
- Browser, both browsers, a roster holding `王 小明` and `Ǆemal Ǳonić`, each
  avatar read through the Contract's helper:
  - **One line**: every client rect of `王小`'s text shares one `top`. Without
    `nowrap` Firefox breaks it (measured, 2 lines); Chromium fits it, so it
    passes there either way.
  - **Clipped**: for `ǄǱ`, `document.elementFromPoint` 2 px right of the
    disc, at its vertical centre, is an element (so the point is in view) and
    not the avatar. Without `overflow: clip` it is the avatar. The point sits
    in the 8 px gap before the name, which the text overruns: `ǄǱ` is about
    32 px wide in both browsers against a 22 px disc, drawn in the bundled
    Inter (latin-ext), so no system font decides it. A point near the text's
    right edge lands on the name in Chromium, clip or not (found while
    building).
- Untested: `clip` rather than `hidden` (decision 4); a check could only
  restate the CSS.

## Decisions

1. **One pick when an emoji is involved** (user, option D). The issue's B
   (letters first) overrides the name's order; its A (clip only) still cuts or
   squeezes a letter beside an emoji.
2. **Emoji pick means pictograph or flag, not "not a letter"** (my call).
   Punctuation is narrow and never broke a disc, so `(Bob) Smith` keeps `(S`.
3. **`nowrap` stays despite the rule** (user): Firefox breaks `王小`.
4. **`overflow: clip`, not `hidden`** (user, tested). `hidden` makes the disc a
   scroll container; `clip` only cuts. `Walter White`'s `WW` already spills
   1.1 px in Firefox. A browser without `clip` ignores it and draws as today.
5. **The avatar gets a test id** (user). Role and name queries skip an
   `aria-hidden` span, and the test contract reads roles, names, text and test
   ids only.
6. **A lone bracket is accepted** (user). `(Bob) 🤖` gives `(`: the name's
   order decides, with no exception for punctuation.

Accepted corners:

- A keycap (`1️⃣`) starts with a digit, so it is not an emoji pick; beside a
  letter it may be squeezed, and the CSS keeps it on one line in the disc.
- `©`, `®` and `™` are pictographs, so a name starting with one draws it alone.
- A letter whose uppercase is several letters (`ß` gives `SS`, `ﬃ` gives
  `FFI`) widens the initials as today; the CSS keeps them in the disc.
- An over-wide pair sits off-centre, cut on its right side.
- Safari is not tested: the e2e suites run Chromium and Firefox, and no iPhone
  is at hand.
