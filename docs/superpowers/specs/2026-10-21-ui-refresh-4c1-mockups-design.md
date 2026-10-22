# UI Refresh, Step 4c1-mockups: The Mockups' CSS Moved into the App

Date: 2026-10-21
Status: In discussion
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4

## Purpose

4c1-foundation chose plain CSS so the app and the mockups share one source
(`docs/superpowers/specs/2026-10-21-ui-refresh-4c1-foundation-design.md`,
decision 1). This step makes them share it: all of both mockups' CSS moves
into stylesheets in the app, renamed to one convention, and the mockups link
them. The app does not import them yet; 4c1-wide, 4c1-narrow, 4c1-editor and
4c2 do as they build each layout. The mockups stay the design tool for steps
4 and 5+, shown to the designer and to users, so their look may change only
where the product owner rules it.

## Terms

- **The mockups**: `docs/design/room.html` and `lobby.html`, and the cells
  pages that frame them.
- **The area files**: the stylesheets the mockups' CSS moves into (decision 2).

## Decisions

1. **The naming convention.** A class's prefix is its owning component
   (`deck-card`, `round-bar`, `issue-panel`, `voters-mark`, `roster-row`);
   the page frames are `room-page` and `lobby-page`; the looks shared across
   areas are `button`, `button-primary`, `panel`, `message-notice` and
   `brand-logo`. A state is styled through its ARIA attribute where today's
   app has one (`.deck-card[aria-pressed="true"]`), the mockups' templates
   changed to match. CSS nesting syntax is not used, and the mockups'
   descendant selectors are kept (my call), but for the room id, which takes
   `room-header-id`, the class 4c1-foundation puts on today's room id. The
   renaming diff is the record of the names; it removes every collision
   found, with Bootstrap (`card`, `mark`, `figure`, `progress`, `row`, `col`,
   `btn`, `lead`) and between the two mockups.
2. **One area file per class prefix, named after it, in
   `frontend/src/components/`** (`round-bar.css`, `deck.css`,
   `room-header.css`), where the components that will own them live, so
   nothing moves when they appear and the mockups' links never change (product
   owner's ruling). There too `room-page.css`, `lobby-page.css` and
   `looks.css`, the frames and the shared looks. Set aside: one file per
   today's TSX, whose names 4c1-wide's components would change; one per J10
   area, which each slice would split.
3. **`frontend/src/page.css` holds the element rules the mockups open with,
   merged** (product owner's ruling): `*`, `html`, `body`,
   `a { color: var(--ink) }`, `button, input { font: inherit; color: inherit }`,
   `button { cursor: pointer }`, `svg` and `:focus-visible`. Each value is
   kept even where the reset says the same, since it states the page's
   intent. It goes into the `base` layer after the reset (foundation decision
   3), so it beats Bootstrap's base rules on the new markup and the fence
   undoes it on today's. Every stylesheet lands in one bundle, so each rule
   applies on both pages. The merge fixes the room's phone menu
   Leave, drawn in the browser's default blue because no rule set its colour.
4. **The mockups link the app's files.** Each mockup's `<style>` opens with
   `@import url(../../frontend/src/reset.css) layer(base);` and the same for
   `page.css`, since a `<link>` cannot set a layer, and the mockup links
   `colours.css`, `tokens.css` and its area files. Its own `<style>` keeps only the rules
   matching nothing but what `later=1` adds, the probe and the parameter
   switches (my call); a rule `later=1` merely changes moves. Bootstrap is not
   loaded. The fonts still come from Google, their link's `display=block`
   becoming `display=swap`, the app's mode (foundation decision 5).
5. **The lobby's room id field at `--weight-medium`,** as every other room id
   is (product owner's ruling): the 400 was unintended, and JetBrains Mono is
   served at 500 only (foundation decision 4).

## Accepted costs

- The mockups keep loading their fonts from Google: they must open from a
  checkout without `npm install`, and the latin Inter file is the same bytes.
- The area files ship in the repo unused by the app until each slice imports
  them; the gate's rule (foundation decision 9) already reads them.
- The mockups render without Bootstrap, so where its base rules reach the new
  markup the app can differ from them until 4c2 (foundation's Accepted
  costs).

## Contract

No case changes, and the app's look does not change: nothing imports the area
files, and the gate's rule passes on them.

Judged by a computed-style diff of the mockups before and after the move,
every element paired by its path from the root, in Chromium, at each of the
cells pages' widths, each parameter value changed alone from the defaults,
`later=1` included (my call). Each difference goes to the product owner, who
rules whether it moves or the move is fixed. Expected ones:

- from the reset, which the mockups did not load before, but for the issue's
  heading, which keeps filling its first line (product owner's ruling);
- the room's phone menu Leave, from the browser's blue to ink (decision 3);
- the lobby's panel taking the room's hairline and padding, its Dismiss the
  room's quiet button, and in forced colours its mark the room's, each shared
  look converging to the room's version (product owner's ruling);
- the lobby's room id field at medium (decision 5).

## The docs' changes

- **Parent**: none; 4c1-foundation's change adds this step's row and text.
- **Reference**: the Mockups section says the mockups link the app's area
  files and import the reset and `page.css` into the `base` layer, their
  `<style>` keeping only their own parts.

## Branches and commits

One PR on `20260930.ui_refresh_4c1_mockups`, stacked on 4c1-foundation's
`20260930.ui_refresh_4c1_foundation`: this document first, then the move with
the reference's change.
