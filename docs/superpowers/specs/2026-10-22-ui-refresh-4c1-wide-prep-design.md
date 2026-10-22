# UI Refresh, Step 4c1-wide-prep: The Mockups' Icons and the Avatars' Tokens

Date: 2026-10-22
Status: In discussion
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4

## Purpose

Two migrations 4c1-wide needs before it builds the room page, so that it
imports the icons and reads the avatars' colours rather than deciding them.
The mockups draw their own icons, simplified paths the app has no copy of,
and the roster's avatars take 14 colour pairs written in `room.html`'s script,
which in the app would put colours outside the value source (principle 6).
After this step both live where the app reads them, and the mockups show what
ships.

## Terms

- **The mockups**: `docs/design/room.html` and `lobby.html`.
- **An avatar pair**: the initials' colour and its pale ground, one of the 14
  that `room.html` picks from by a hash of the name (3b1 decision 17).

## Decisions

1. **The mockups draw lucide's icons, the app's set** (product owner's
   ruling). `lucide-react` is already the app's; its icons are drawn with round
   ends and finer detail, and the designer's screenshots seem to show the same
   style (inferred, from a low-resolution image). Each icon takes lucide's
   nearest: Edit `pencil`, Clear votes `trash`, Copy
   link `link`, Leave `log-out`, ☰ `menu`, Show votes `eye`, Re-vote
   `rotate-ccw`, Save `check`, Cancel and Dismiss `x`, a problem
   `triangle-alert`, a notice `info`, Next issue `arrow-right`. The brand mark
   keeps its own glyph. Set aside: the mockups' paths in the app, which needed
   their dots and Leave redrawn and an icon file of our own to keep; each side
   its own set, which leaves the mockups showing what does not ship.
2. **One icon file for both mockups,** `docs/design/icons.js`, a classic script
   each mockup loads, holding each icon's elements and attributes by lucide's
   name (my call): a `<script src>` works from `file://`, where a module does
   not, and the mockups must open from a checkout. Lucide's licence, ISC with
   Feather's MIT for the icons derived from it, asks for its notice in every
   copy: it sits beside the file as `docs/design/lucide-LICENSE.txt`, copied
   from the package, and the file's first comment names it (my call).
3. **A unit test keeps the copies equal to the package.** In `test:unit`, each
   entry of `icons.js`, drawn as the mockups draw it, equals what the
   `lucide-react` component of that name renders, its attributes included; a
   name lucide does not have fails. So a Dependabot bump that redraws an icon
   fails the suite until the copy follows.
4. **The 14 avatar pairs become tokens** (product owner's ruling),
   `--avatar-1` to `--avatar-14` for the initials and `--avatar-1-ground` to
   `--avatar-14-ground` for their grounds, in `colours.css`, the values and
   their order unchanged. The mockup's script names the tokens in its inline
   `--h` and `--t`; `roster.css` is unchanged. Set aside: 14 hue tokens with
   each ground mixed from its hue, whose grounds would differ from the
   accepted ones; the pairs as literals in TSX, against principle 6.
5. **The avatars join the gate's decorative set, by the `--avatar-` prefix.**
   They are exempt from contrast as incidental text (J8, 3b1 decision 17), so
   no pair reaches them. Kept exempt rather than tuned: every pair is under
   7:1 (4.52 to 6.41 under normal vision), and reaching it would bring every
   initial near black.

## Accepted costs

- The icons the product owner and the designer accepted in 3b1 change shape;
  the designer sees lucide's at his final validation.
- `colours.css` doubles in length for decoration.
- Today's app keeps `Pen` for Edit where the mockups now draw `pencil`, until
  4c1-wide and 4c1-editor replace its markup.

## Contract

No case changes, and the app's look does not change: it draws no avatar yet,
and its icons are untouched.

Judged by the product owner, by eye on both mockups and on a computed-style
diff of them before and after, as 4c1-mockups' (its Contract); the only
expected differences are the icons' elements and attributes. And by the new
unit tests, each shown to fail: an icon's copy edited, an entry with a name
lucide lacks, a colour token outside the prefix left unreached, an avatar
token reached by no pair.

## The docs' changes

- **Parent**: the steps table gains this step's row between 4c1-mockups and
  4c1-wide, which now waits on it, and step 4's text names it.
- **Reference**: the Mockups section names `icons.js` and its licence file;
  the Tokens table's colour row gains the avatars, and J8's exemption names
  their tokens.

## Branches and commits

One PR on `20260930.ui_refresh_4c1_wide_prep`, stacked on 4c1-mockups'
`20260930.ui_refresh_4c1_mockups`: this document with the parent's change
first, then the icons, then the avatar tokens, each with its reference change.
