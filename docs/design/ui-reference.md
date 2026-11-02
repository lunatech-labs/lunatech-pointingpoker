# UI Reference

Date: 2026-10-07
Status: In discussion (step 3 of `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`)

The design reference step 4 applies. Step 3a gave the token values, in the
value source, and step 3b draws the layouts. Decisions are provisional unless
marked **(settled)**, as in the UI refresh design's "How decisions are
marked". The rules come first; the reasons and the options set aside are in
the decisions log at the end.

## Terms

- **Token**: a CSS custom property in the value source (principle 6 for
  colours).
- **Value source**: `frontend/src/colours.css` for the colour tokens and
  `frontend/src/tokens.css` for the rest, the only place a token's value is
  written, each token with a one-line purpose comment. It is the contract
  between 3a, which gave the values, and 3b, which uses them. A token's purpose
  is not called its role, since voter and facilitator own the word.
- **Phase**: voting or revealed. A Re-vote returns the round to voting.
- **Layout cell**: one page (voter, facilitator or lobby) in one phase at one
  target screen; the lobby has no phase.
- **Shared-screen elements**: the progress and the result (principle 5; the
  issue left the list in 3b1).
- **Card**: one of the deck's 13 buttons, which a voter clicks to vote.
- **Participant entry**: one voter in the participant area, today a table row;
  its form is L3's. Facilitators have none; they are the roster's last rows
  (J3).
- **Round bar**, **slot** and **roster**: as in 3b1's spec (J10).
- **Hairline**: a divider or a surface's edge, and nothing else. It is
  decorative: it identifies no control and no state.
- **Message**: anything J6 gives a tone: a problem, a notice or a
  confirmation. Principle 4's notices are the first two.
- **Banner**: as in the UI refresh design's Appendix C.

## Mockups

- They live beside this file, under `docs/design/`, as clickable HTML linking
  the app's stylesheets: the value source, `looks.css` and their area files in
  `frontend/src/components/`, with `reset.css` and `page.css` imported into the
  `base` layer. Their own `<style>` keeps only the later steps' parts and the
  parameters' design alternatives.
- They show what step 4 builds and, behind a "later steps" toggle, the parts
  later steps add (progress count, Next issue, recent rounds), dashed, so step
  4 leaves room for them.
- They include a re-vote, where the kept look shows (J3), and a reveal with a
  kept vote.
- `room.html`, the room page at every width (J10, J11, J12). Its parameters,
  listed at the top of its script: `role`, `phase` (`voting`, `revote`,
  `revealed`, `revealed-revote`), `later`, `layout` (f, the default, or g),
  `votes` (`sample`, `tie3`, `tie4`, `0`), `voters`, `issue` (empty draws "No
  issue yet"), `me`, `name0`, `brand`, `message` (today's banners and the
  editor's messages), `edit` (`1` the editing view, `saving` its saving
  look), `menu` (☰'s row open), `room` (the room id), `facilitators` (1 to 5)
  and `probe` (the root and the width in `rem`).
- `room-cells.html`, its layout cells side by side at a chosen width (1280,
  1000, 800 or 392 px) and height, each with a link that opens it alone at
  the window's size.
- `lobby.html`, the lobby's three pages (J13). Its parameters, listed at the top
  of its script: `page` (`root`, `pinned`, `notaroom`), `tab` (`create`,
  `join`), `name`, `remembered` (`slug`, `legacy`, `none`), `rejoin` (`chip`
  outlines the row's arrow), `role`, `message` (the join and create failures,
  the lost connection, the ended session, the moved and restart notices),
  `room`, `typed`, `suggestion`, `stored`, `longest` (the longest valid id) and
  `probe`.
- `lobby-cells.html`, the lobby's pages side by side at a chosen width
  (1280, 800, 392 or 320 px), each with a link that opens it alone.
- `icons.js`, the icons both mockups draw, lucide's, copied from `lucide-react`
  by name; `frontend/src/design/icons.test.ts` keeps it equal to the package,
  and lucide's licence sits beside it as `lucide-LICENSE.txt`.

## Brand source

lunatech.com's stylesheet, read 2026-10-06:

- A light, warm theme: `--paper: #FCFAF6`, `--paper-warm: #FEFDFB`,
  `--paper-pale: #F0EBE2`, `--pale: #D6CABB`; text `--ink: #1E1815`,
  `--ink-soft: #3B312C`; muted `--mute: #6B5E54`, `--mute-soft: #8A7A70`;
  dark sections `--night: #1A1411`, `--night-soft: #2A211C`.
- One accent: `--burgundy: #952B30`, `--burgundy-deep: #5C1C20`,
  `--burgundy-light: #DE9C9F`, `--burgundy-tint: rgba(149, 43, 48, 0.08)`.
- Type, all from Google Fonts: Instrument Serif (display, regular only), DM Sans
  (body, 300 to 700), JetBrains Mono (the most used, 400 and 500), Space
  Grotesk in a few places.
- Contrast on `--paper`: burgundy 7.56, burgundy-deep 12.27, ink 16.83,
  ink-soft 12.12, mute 6.01 (fails AAA), mute-soft 3.95 (fails AA). White on
  burgundy 7.88. Burgundy against ink is 2.23, 1.79 under protanopia.
- Under deuteranopia burgundy falls to 6.67 on paper, and white on it to 6.95,
  so the app's burgundy is about 5% darker, `#8E292E` (7.14 and 7.43) (J8).
- The app takes the site's gist, not its values: lunatech.com was not built
  for contrast, so a value moves wherever J8 needs it, the hue kept.
- From 3b1's second look (2026-10-12), the app saturates the brand's hue: the
  designer's red family over burgundy, the same hue (355° against 357°), more
  saturated. His bright red, `--card-back` #DC2F3C, marks shapes without
  text. Darkened to #9B1A24, it carries the primary button's white at 7.05
  under deuteranopia, its worst vision, and a problem's text takes #931822,
  7.05 on its tint under deuteranopia (3a2 decision 6).
- lunatech.com's restyle of October 2026 is not followed: it came without the
  designer, so it is marketing, not a design system, and the apps follow the
  brand at their own pace.
- The header mark: the Lunatech glyph in white on the red card back, a pale
  card offset behind it; `brand=pip` draws the plain back. The mark, its
  colour, the app's name and any mention of Lunatech are a later branding
  change's.

## Rules

### J1. Target laptop height

- The **floor** is a viewport of **1280 by 600** CSS px: there the page never
  scrolls with an issue of up to two lines, and every element but the
  participant area is in view. The **comfort target**, **1280 by 680**, puts
  14 entries in view too; it is provisional until a Windows laptop is
  measured. Step 4's no-scroll cases use both.
- "Fits" is measured with the root font size J2 gives at that viewport.
- Hand checks in 3b: 1344 by 757, 1536 by 756, 1280 by 952, 1512 by 749,
  1329 by 696, 1472 by 1493 and 1280 by 1300 (half of a 4K and of a 2560 by
  1440 monitor), and 3072 by 1598 as the monitor case.

### J2. One fluid root, everything else in rem

- The root font size is the only fluid value, the `--root-size` token,
  `clamp(1rem, min(1.05vh, 0.82vw) + 0.5rem, 1.75rem)`: it follows the
  height, and the width instead on windows less than 1.28 times as wide as
  tall. The contrast gate (J8) passes only the shape `clamp(<min>rem,
  min(<a>vh, <c>vw) + <b>rem, <max>rem)` and checks it against the three
  rules below; the `vw` term can only lower the root, so no rule bounds `c`,
  and 3b2's rules hold for any `c`. Its limits are in `rem`, so the reader's
  default font size counts.
- The root sits at its minimum up to the laptop sizes (J1's floor, comfort
  target and hand
  checks below 800 px tall), so browser zoom there is exactly linear.
- `b` is above zero, so every zoom step grows the text at every viewport.
- `max` is at most 2.5 times `min`, so text reaches twice its size within
  Chromium's and Firefox's 500% zoom at any viewport.
- Every other size is in `rem`, but the label tracking and the tight point
  in "0.5", in `em` so that they follow their own text, a chart value's
  fit, in `cqi` so that it follows its column, and the deck's width, so that
  the compact slot follows its deck; the gate allows each unit on
  its tokens only. No viewport unit appears outside the root but the app
  shell's height: exactly `100dvh` in the wide layout, its content overflowing
  it once the table is at its least height, and at least `100dvh` in the
  phone layout (J11).
- `px` only for the hairline token and inside a pixel floor. Every other line
  (the Lines tokens but the hairline: control lines, J3's marks, the kept
  frame's band, message bars, the focus ring) is in `rem` with a pixel floor,
  such as `max(2px, 0.125rem)`, so it scales with the root and never rounds to
  nothing, the soft shadow's lengths included (J9). The gate checks the units
  in `tokens.css`.

### J3. How each round state is shown

Shape for the room, words for the reader: what the room watches differs by
shape or fill from afar, and words explain the rest up close.

- **Estimate**: a value a voter has given since the last Clear or role switch
  (`Seat.switchedTo` drops it).
- **Confirmed**: an estimate chosen since the last Re-vote. The auto-reveal
  waits for every voter to be confirmed (`RoomData.complete`).
- **Kept**: an estimate from before the last Re-vote, not chosen again;
  principle 5's unconfirmed (`voted` false, `hasEstimation` true in
  `room/view.ts`).

| Voter's entry | While voting | Once revealed |
| --- | --- | --- |
| No estimate | outline | "–" in the value's place |
| Confirmed | solid fill | the value |
| Kept | kept frame | the value, the kept band outside its face |

| Card | Shown as |
| --- | --- |
| Not chosen | plain |
| Chosen, confirmed | solid fill |
| Chosen, kept | the kept frame around the figure, and a "not confirmed" tag |

- Three looks answer the room's two questions at a glance: who has chosen
  again, and whether enough estimates exist for a reveal to mean something.
- No tag on a kept entry while voting: the kept frame carries it, and the
  accessible name says it.
- **Solid fill** and the **kept frame** are each defined once, on entries and
  cards alike, in red (J4). The solid fill covers the mark in `--card-back`,
  and the chosen card in `--burgundy`, since the card carries its figure in
  white at 7:1 (J8). The kept frame is a solid band of `--card-back` around a
  paper centre: `--frame-band` on a card, and that band times the entry scale
  on an entry. The frame surrounds
  a card's figure, so the figure stays on paper and in line with the others.
  Outline, kept frame and fill read as no fill, some, full: no estimate, kept,
  confirmed.
- A card's size is 3b's, with a token 3b adds: a kept card shows its widest
  figure inside the band with room around it (J11).
- The card's tag is `aria-hidden`: its hidden description, "Previous vote,
  not confirmed", already says it. It sits outside the button, in the card's
  wrapper beside that description, so the button's text stays the figure
  (see "Contract reads"). In the compact foot it sits on the top line, away
  from its card, and the kept frame marks the card (J11).
- 3b checks the kept frame on screenshots shrunk to a 480 by 270 video tile,
  and from a few metres away, on the smallest entry mark too (L3). If it fails
  there, 3b sends the band back to 3a (Tokens).
- **Facilitators** have no round state, so they have no entry. They are the
  roster's last rows, each marked "Facilitator", in step 1b's order, however
  many (3b1 decision 17).
- Each look has one mark with an accessible name, written for the listener
  (WCAG 1.1.1, and 4.1.2 for a card's state), one wording per state: "No
  vote", as on the revealed "–"; "Voted"; and "Previous vote, not confirmed",
  as on the kept card. Step 4c1-wide rewrote the mark reads to match (see
  "Contract reads").
- Marking a revealed kept value on entries is new; the voter's own card already
  marks it. It shows data the view already has, and adds no behaviour.
- **Forced colours** (Windows' contrast themes) repaint backgrounds, which
  would erase the fills:
  - a kept frame is a border, which the browser repaints in the user's
    colours with no opt-out;
  - the fills that carry a state or a value opt out (`forced-color-adjust:
    none`), drawn only in system colours (`Canvas`, `CanvasText`): the chosen
    card, the voted mark with its pip, the chart's bars and the header mark;
    a banner's bar takes `CanvasText`;
  - 3b checks each look under Chromium's forced-colors emulation, a focused
    card included.

### J4. Red marks the action and the voted back, never a state against ink

- Reopened in 3b1's second look (2026-10-12). Red marks the toggle, the
  primary in both phases; the voted back, its solid fill and the kept frame;
  and once revealed the most-voted bars. Every J3 state is drawn in the card
  back's colour, `--card-back`, the designer's bright red, but the chosen
  card's fill, which carries its figure in white and so takes `--burgundy`.
- States differ by shape, never by red against ink. Clear stays quiet, and
  in its deep shade red marks a problem message (J6).
- Faces, figures, links and the focus ring stay ink (J8). Links are ink and
  always underlined, so they never rely on colour; Copy link is ink too.

### J5. The round's actions per phase

A button shows only in the phases where it does something.

| Phase | Step 4 | From step 5 (Next issue) |
| --- | --- | --- |
| Voting | Clear votes quiet; **Show votes** primary | Clear votes quiet (step 5 decides whether it stays); **Show votes** primary |
| Revealed | Clear votes quiet; **Re-vote** primary | Clear votes quiet; Re-vote secondary; **Next issue** primary |

- After a Re-vote the round is voting again, with the voting buttons.
- **Show** is the Show votes button, **Clear** the Clear votes one.
- **Primary** is the phase's one red button (J4); **secondary** an outline;
  **quiet** an ink button with words and an icon, never red.
- The actions are right-aligned in the round bar, in that order, Clear set
  apart, the tab order the visual order. Show votes and Re-vote are one
  button, the toggle, at the edge until step 5; from step 5 Next issue takes
  the edge once revealed, the primary there, and no place is kept for it
  while voting.
- Show is hidden while revealed by becoming the toggle, built with its guard
  in step 4b (a contract change, after step 1c removed Show's incidental
  uses). Re-vote still shows only while revealed, a guard principle 8 carries
  over.
- **The round bar's guard**: every action in the round bar ignores presses
  for 1 s after any phase change, defined in 3b1 decision 6.
- An action is **destructive** when it discards votes nobody has seen: Clear
  while voting. It is marked by its words (its icon in the phone layout), its
  quiet look and its distance from the phase's other actions, never by colour
  or a confirmation (Appendix A, avoid 6). Step 4 keeps Clear quiet in every
  phase.
- In the phone layout Clear and Edit are their icons alone, their names kept;
  Clear is marked by its icon, its quiet look and its distance (3b2 decision
  10).
- Next issue's flow, an assumption for the mockups only: the editor opens empty
  and focused, saving starts the new round, cancelling changes nothing.
- What step 5 decides is listed in its section of the UI refresh design.

### J6. Message tones

The tone is carried by the icon and the words; the colour of the box and its
bar only reinforce them.

| Tone | For | Look |
| --- | --- | --- |
| Problem | something failed or broke: the connection lost, the session ended, a join, create or save failed | burgundy-deep text on the burgundy tint, a burgundy-deep bar, an icon |
| Notice | something changed to know about: the moved link, the restart ("Reconnected. Please check your vote."), the issue changed by someone else | notice-ink on notice-ground, a notice-bar bar and icon |
| Confirmation | the user's own action done: "Link copied" | plain text beside its cause, no box |

On the room page the banners sit full width under the header, each message a
panel of its own with the common hairline, and no panel around them. Their
stacking, Dismiss and mounting are J12's.

### J7. Type, self-hosted

- Inter for all text, figures included (3b1's second look); JetBrains Mono for
  the room id.
- The brand lockup, in the room header and the lobby (J13), is Inter bold; no
  serif is drawn, so the value source has no serif token.
- The app serves the fonts, not Google's CDN. The families are SIL OFL 1.1
  with no Reserved Font Name (google/fonts, `OFL.txt` and `METADATA.pb`), so
  subsetting and woff2 need no renaming, and the licence text ships beside
  the files.
- **Shared-screen text** is sized for 4 m on a 40 inch TV at the laptop
  target: the `--text-3xl` step, 44 px, and the most-voted value at the 4xl
  step. The result's chart, its values and counts, is the one element at the
  3 m step, `--text-2xl`, a value shrinking only where its column is narrower
  (3b1). The issue is at `--text-lg`, a heading's size.
- A late font swaps in once; the latin file is preloaded, so a normal load
  draws Inter from the first paint.

### J8. Contrast floor

- All text at AAA, 7:1, large text included (AAA asks 4.5 there), on every
  ground it sits on: help lines, labels, placeholders and links included.
  Supporting text is `--grey`, at the body size; the hierarchy comes from a
  600-weight lead in ink. No text is italic.
- Other indicators at 3:1 at least (WCAG 1.4.11), a line that identifies a
  control included. The decorative colours are exempt, the gate's decorative
  set: the hairline's pale, and the colours drawn only in a shadow, the soft
  shadow's, the chosen card's glow and the header mark's offset card, since
  forced colours drop shadows and the hairline alone tells surfaces apart
  (J9). So are the roster's avatars, initials on a pale ground, the pair
  picked by a hash of the name, `aria-hidden` and incidental: the name beside
  them carries the information. The set lists their tokens by name,
  `--avatar-ink-1` to `--avatar-ink-14` and `--avatar-ground-1` to
  `--avatar-ground-14`, so a later avatar token is not exempt by its prefix.
- **Focus** is an ink `outline`, at least 2 px thick and offset by a gap of at
  least 2 px, `--focus-width` and `--focus-gap` (J2); never a `box-shadow`,
  which forced colours remove. On every ground it meets both WCAG tests: 2.4.13
  (AAA), an area at least a 2 px perimeter with 3:1 between the focused and
  unfocused pixels, and 1.4.11, 3:1 against what touches it. On the
  forced-colours opt-outs (J3), it is `CanvasText`.
- Focus is never hidden behind a banner, the scrolled participant area or
  the phone's pinned sheet (2.4.12, J11).
- Under `prefers-contrast: more`, the hairline colour turns `--mute-soft`, an
  indicator at 3:1, and the control line takes the mark line's weight.
- **The contrast gate**, a Vitest test in `test:unit`, checks each text and
  indicator colour at its floor on every ground it can sit on, under normal
  vision and the colour-blind simulations (Machado 2009, full severity): a gate
  at the same floors, not a report. Its pairs are listed in
  `frontend/src/design/gate.ts` and follow the value source's current values.
  It checks pairs of tokens, not rendered pages: a component that puts a
  foreground on a ground outside the list escapes it until review catches it
  or the pair is added.

### J9. Motion, surfaces and shapes

- **Motion**: only small transitions, such as entries turning on a reveal and a
  button changing state, each `--duration` long (at most 200 ms), and none under
  `prefers-reduced-motion`. Motion never carries information alone.
- **Surfaces**: the page on paper (the room page on paper-pale, J10), content
  surfaces on white panels with rounded corners, a hairline and a soft shadow
  (3b1's second look); the hairline alone tells them apart where a shadow is
  lost. A shadow is two tokens, its lengths in `tokens.css` and its colour in
  `colours.css`, joined where it is used: `var(--shadow) var(--shadow-colour)`
  for a panel, `var(--lift-shadow) var(--lift-colour)` for the chosen card.
- **No dark sections**: one light theme (principle 6).
- **Shapes**: lunatech.com's, as measured on 2026-10-07: corners square but the
  scrollbars' 2 and 3 px and the 50% dots; 1 px lines; 2 and 3 px burgundy
  bars; a 2 px focus outline, offset 2 px; transitions of 0.18 to 0.25 s;
  buttons at least 44 px tall, kept as `--target-min`.
- **Corners** are rounded (3b1's second look): panels and messages take
  `--radius`, cards, rows and inputs `--radius-card`, buttons
  `--radius-control`; the tokens hold the rest.
- **Two line weights**: controls keep the brand's 1 px line, `--line-control`;
  J3's marks take 2 px, `--line-mark`; both within J8's 3:1 for indicators.

### J10. The wide room page

Step 3b1's spec holds its rules,
`docs/superpowers/specs/2026-10-09-ui-refresh-3b1-wide-room-page-design.md`,
and `room.html` draws them. It covers L1 to L4, L6, L5's card size and L11's
breakpoint for this page, in the designer's look: four areas (the header, the
banners, the column with the issue, the table, the slot and the round bar,
and the roster's sidebar), the entries as cards at a fitted scale, the deck's
cards shrinking with the column down to the touch target, and the result as
the deck's 13 values in columns, in the deck's place after a reveal. J11
moves its breakpoint to 51.75 rem and gives it a compact foot below 65.75 rem.

### J11. Narrow and large screens

Step 3b2's spec holds its rules,
`docs/superpowers/specs/2026-10-15-ui-refresh-3b2-narrow-and-large-design.md`,
and `room.html` draws them.

- **Two switches**, both container queries on the page's width: 51.75 rem
  switches the structure, the wide layout (J10) at and above it and the phone
  layout below, and 65.75 rem switches the foot.
- **The compact foot**, below 65.75 rem in either layout, wraps the deck in
  balanced rows (5, 5 and 3, then 7 and 6 from a 22.25 rem deck), each card
  between `--target-min` and `--deck-card`, keeps the
  slot at one height through a reveal with the result stacked in it, puts the
  kept tag and the voter's progress on the line above the deck, and keeps the
  round bar on one row.
- **The phone layout** is one column, the issue, the table at its own scale,
  then the slot and the round bar as one sheet, pinned to the viewport's
  bottom where the viewport is at least 39 rem tall, its header one row with
  ☰ for the role switch and Leave, and one line naming the facilitators in
  the roster's place; keyboard focus outside the sheet keeps clear of it, by
  scroll margins and, for Firefox, a scroll to the top of what the sheet
  covers.
- **The cap** stops the page at 106 rem, centred, the header's bar full width
  and its content aligned with the page; in the phone layout the header
  shares the column's edges.
- **The shared screen** is the wide layout, as principle 4's last row says
  (3b2 decision 14).
- The room page keeps its scrollbar's gutter, so the two layouts never
  alternate as a scrollbar comes and goes (3b1 decision 2). Media queries in
  `rem` resolve against the reader's default size, not the fluid root; a
  container query reads the root.

### J12. The issue editor and the messages

Step 3b3's spec holds its rules,
`docs/superpowers/specs/2026-10-16-ui-refresh-3b3-issue-editor-and-messages-design.md`,
and `room.html` draws them (`edit=1`, `edit=saving`, and `message` with
`conflict` and `save-failed`).

- **The banners** stack by tone: the lost connection, then the moved link, then
  the restart. Only the notices have a Dismiss, an × alone named "Dismiss" at
  the panel's right, which moves focus to the page's `h1` (`tabindex="-1"`, so it
  takes focus without joining the tab order). The Messages section mounts only
  while a banner shows.
- **The editing view** is a wrapping `<textarea>` at `--text-lg` named "Current
  issue", which grows to fit by `field-sizing: content` (a browser without it
  keeps one line). Enter saves and never inserts a line break; `oneLine` keeps
  the draft to one line. Save and Cancel, icon and word, sit
  beside the field at and above 65.75 rem and below it under 65.75 rem, in both
  layouts (J11's compact switch), in the DOM order field, Save, Cancel,
  messages at every width. In the band between 51.75 and 65.75 rem a panel
  with a narrow arrangement uses it unless measured otherwise. When the
  editing view closes (Escape, Cancel, a save that succeeded), focus returns to
  Edit if it was inside the panel or had dropped; focus the user moved elsewhere
  is left alone.
- **While saving**, Save and Cancel are `aria-disabled`, keep focus and take
  the lobby's inert look (`--grey` on `--paper-pale`, 7.06:1); the field is
  read-only. After a failure the field takes focus only if focus fell to the
  page.
- **The editor's two messages** are message panels under the buttons, inside
  the editor region (step 1a's `issue-status`, always rendered and never
  `display: none`), the problem above the notice, with no role of their own.
- A banner arriving on a scrolled page stays above the view, by the browser's
  scroll anchoring (3b1 decision 3).

### J13. The lobby

Step 3b4's spec holds its rules,
`docs/superpowers/specs/2026-10-19-ui-refresh-3b4-lobby-design.md`, and
`lobby.html` draws them.

- **The regions** are the room page's: the header bar with the brand lockup,
  then one centred column that the header's content, the banners and the panel
  share a left edge with. The column is `--lobby-width`, 24 rem until judged,
  and `min(--lobby-width, 100% - 2 × --page-edge)` on a narrow screen; one
  column at every width, no breakpoint and no hero.
- **The `h1` names the form**: "Create room" or "Join room". Dismiss's focus
  lands on it. The tabs are links, the active one `aria-current="true"` and
  marked by weight and a bar, the others underlined (J4); the pinned form has
  none, its room fixed in a badge.
- **The room row** is a link as a whole: a plain `--card-back` square, the room
  id in monospace, a second line, an ink arrow. Its name is its content in
  visible order, `<id> <line 2>`, with no `aria-label`, a literal space between
  the two lines so the name reads the same in any layout. Line 2 reads "Rejoin"
  alone when the typed name is empty or only spaces. Line 2 is underlined, J4's
  cue; a link drawn as a button is not. An id wraps at its hyphens and is never
  cut, in a row and in the badge.
- **One burgundy-filled control per page**: the primary button, or, where the
  row is the page's primary, as on the not-a-room page, the row's arrow as a
  small burgundy chip.
- **The messages** are banners above the panel, one problem at a time (ended,
  then lost, then a failure) and the notices by tone. A form shows only the
  messages it can have: the lost connection and the ended session on the pinned
  form, the only one with a stream, and the create failure on the root form. After "Your session has
  ended" the panel stays, its name, roles and Join inert in the app's inert
  look, `--grey` on `--paper-pale` (the editor's saving look too); an inert
  control's edge is exempt from J8's 3:1.
- **The not-a-room page** is drawn in the same regions. Its `h1` reads
  `<code><bdi>x</bdi></code> is not a room name.`, the typed name wrapping
  anywhere and isolated by the `<bdi>`. A suggestion is a room row under the
  plain text "Did you mean", reading "Join as <name>" from the stored name; the
  secondary action is "Join a different room", which opens `/` on the Join tab.

## Tokens

The value source (Terms) holds every token's value and purpose; this section
keeps the kinds and the rules, and no value is written twice. Every colour,
size, font and duration in a component's CSS comes from a token (principle 6
for colours), except CSS keywords such as system colours and `currentColor`,
and the switches' values in container and media queries (J11), which cannot
read a token.

| Kind | Tokens |
| --- | --- |
| Colour | the papers, pale and ink (Brand source), the supporting grey (J8), the app's burgundy and its tint, burgundy-deep, the hairline colour and its `more` value (J8), the card back (J4); from 3b1, the chart's other bars, the notice's three, the voted and kept pills, the progress track, the pip, the header mark's offset and the shadows' colours; from 4c1-wide-prep, the avatars' pairs |
| Root | the clamp (J2) |
| Shell | its height (J2) |
| Type | the families (J7); the scale's steps, the weights, the leadings, the label tracking and the tight point |
| Spacing | one scale |
| Shape | the radii (J9); the least target size; the shadows' lengths (J9) |
| Lines | the hairline in `px`; the control line, the mark line, the kept frame's band, the message bar, the focus ring and its gap (J2, J8) |
| Layout | the room page's sizes, such as the sidebar, the header, the panels' gaps and the deck card (J10); from 3b2, the width cap, the sheet's clearance, the phone's entry scale, the deck's width and the result's least heights (J11); from 3b4, the lobby's column (J13) |
| Motion | the one duration (J9) |

- Nothing imports the value source before step 4; 3b's mockups link both
  files. The gate (J8) also checks what each file may hold, and J2's root.
- An alias exists only where its value can differ from its source, such as the
  card back.
- The type scale is named by steps, not roles, so 3b assigns a step to an
  element without renaming a token. It is provisional until 3b's assembled
  mockups judge it.
- 3b may add a token a layout needs: it adds it to the value source, and its
  reason to the log. 3b1's moved there from `room.html` in step 3a2 (3b1
  decision 16); the weights are named by weight, not by font.
- 3b may send a value back to 3a, the change recorded in the log.
- A derived value, such as a pixel floor, lives in a token's definition, never
  as a literal in a component.

## Contract reads the look keeps

The test contract (principle 9) reads these today, in `e2e/fixtures.js` and
the cases. A look that changes one lists it in step 4's contract changes.

Step 3b3's contract changes, for the editing view and the banners, are listed
in its spec
(`docs/superpowers/specs/2026-10-16-ui-refresh-3b3-issue-editor-and-messages-design.md`,
Contract).

- Until step 4c1-wide, the text "Facilitator" inside a facilitator's entry
  (`facilitatorMark`), and one list holding every participant
  (`participantEntries`). The roster changed both, a contract change of step
  4: each facilitator's name in the roster is an element with the test id
  `facilitator`, read exactly (`facilitatorName`), and the list holds voters
  only.
- Until step 4c1-wide, images named "Voted" and "Vote hidden" (`votedMark`,
  `hiddenMark`), matched as case-insensitive substrings, since neither read
  set `exact`. A confirmed entry carried both while voting and "Voted" once
  revealed; a kept one only "Vote hidden" while voting. J3's named marks
  changed them, a contract change of step 4: each mark is read by its exact
  name, "Voted" (`votedMark`), "Previous vote, not confirmed" (`keptMark`)
  and "No vote" (`noVoteMark`). `hiddenMark` became the kept mark's read,
  `keptMark`, which serves the read after a Re-vote and, since only
  `hasEstimation` gives that look, proves it survives redaction. On a
  confirmed entry, the reads of "Vote hidden" were dropped where a read of
  "Voted" or of the value sat beside them; the last, in
  `stragglerDepartsWithVotesHidden`, the only proof that the votes survive a
  departure, became a `votedMark` read. Step 1c moved every read of "Voted" on
  a revealed entry to the value (its list names the cases).
- The kept card's description, "Previous vote, not confirmed"
  (`unconfirmedCard`), from a hidden note, and the card's text, its figure
  alone (`toHaveText('5')`). J3's tag, `aria-hidden` and outside the button,
  left both unchanged.
- Each card by its figure as its exact name (`card`), "0.5" included:
  `Figure` sets its point tight and keeps its text "0.5".
- A revealed entry's `participant-estimation` holds the value and nothing else,
  empty for no vote (`revealedEstimation`, `expectSummaryMatchesParticipants`).
  J3's "–" and "not confirmed" sit outside it. Step 4c1-wide added a read of
  both, a contract addition: at the third reveal of 'a session of rounds keeps
  the summary honest across them', Alice and Bob kept, Carol confirmed and
  Dave with no estimate, only Alice's and Bob's entries carry the kept mark,
  and only Dave's the no-vote mark, each read by J3's name.
- The room id as a heading, any level (`lobby.spec.js`).
- The room's marker, the test id `room` on the room view's root (`inRoom`),
  the sign a join reached the room: it sits on what renders from a snapshot,
  never on a look drawn while joining, as 'the room's marker waits for the
  first snapshot' (`smoke.spec.js`) holds it.
- The issue while viewing, the heading with the test id `issue-text`
  (`issueText`), holding "No issue yet" when there is none, and Edit by its
  name, "Edit issue" (`issueEdit`), though it shows "Edit".
- The issue editor's notices, the status region with the test id
  `issue-status` (`issueStatus`), rendered once, outside both views.
- The round panel's slot, the test id `round-slot` (`roundSlot`), holding the
  deck while voting and the result once revealed; a facilitator's page has
  none while voting.
- `tally-entry`, inside the region "Results", marks a value someone voted
  for; `expectSummaryMatchesParticipants` holds each summary it reads to it,
  reading each entry's `tally-value` and `tally-count`, and the nobody-voted
  case reads none. `most-voted` holds the most voted value (`mostVoted`).
- The copy hint's text, "Link copied to clipboard" until step 4c1-wide, which
  put 3b1's shortened hint, "Link copied", in place, a contract change of
  step 4. The hint is the header's status region (`copyHint`), always
  rendered and empty but for the 2 s after a copy, and "Copy link" is read as
  a link by that name.
- The role switches, the header's and ☰'s, one shown at a time, each a button
  named for the role it switches to, "Switch to facilitator" or "Switch to
  voter" (`switchTo`).
- The table region's name, "Participants", which step 4c1-wide changed to
  3b1's "Voters", its title "Voters · 14", the name "Participants" going to
  the roster; the tally's test ids and `participant-estimation` read the same
  text, and each tally entry gained a spoken reading ("3: 2 votes") beside it.
- 3b1's other contract changes (the deck leaving on a reveal, `frozenNotice`,
  the issue's read view and its empty "No issue yet", the nobody-voted read,
  the phase line's test id, the round bar's region "Round") are listed in its
  spec, and step 4c1-wide made them, with those found after 3b1's list (its
  spec's Contract). The banners' region "Messages" waits for 4c1-banners.

## Open

The layout questions 3b decides, on mockups of each layout cell, in the four
steps the UI refresh design's step 3 groups them into.

L1 to L4, L6, L5's card size and L11's breakpoint for the room page are
settled by 3b1 (J10), L5, L10 and L11 for the room page by 3b2 (J11), and L7
and L8 by 3b3 (J12), and L9 by 3b4 (J13).

- **The lobby's column width**: `--lobby-width` is 24 rem until the product
  owner judges `lobby.html` (J13).
- **The rejoin row's arrow**: the plain ink arrow (the default) or the outlined
  chip (`rejoin=chip`), after the product owner and the designer have seen both.
- **Three rejoin-row variants, deferred for the designer and not rejected**:
  no square with an outlined "Rejoin" button on the right, with the outlined
  arrow chip on the right, and with it in the square's place on the left.
- **The lobby's open costs** (3b4's Accepted costs): a Reload button on "Your
  session has ended"; a "Joining…" look from a press to the first snapshot;
  accepting a full URL pasted into Join.
- **The not-a-room page's React shape** (3b4 decision 15), which step 4d's
  brainstorm raises first: an entry point of its own or a view of the room app,
  and how the server hands over the typed name and the suggestion, keeping its
  404 status.
- **Layout f or g**, the slot below or above the table: f by default, g the
  open swap, after the users' feedback; with the button's and the chosen
  card's darker red against the designer's brighter one.
- **Copy link's colour**: ink since 3b1's review wave (J4); the designer's red
  waits on the designer's final validation.
- **The voters panel's room**: the entries scale to the largest that fits (3b1
  decision 10), so they reach the panel's padding and the panel reads tighter
  than the others; whether to leave them room waits on the designer's final
  validation.
- **The result's balance**: the result keeps the slot's height (3b1 decision
  5), so "Most voted" centres with the leftover above it while the columns sit
  on the padding, 29 px above against 14 below at the comfort target; it waits
  on the designer's final validation.

**Parked** by 3b2, each until its condition:

- The issue at full width above the column and the sidebar, below 65.75 rem:
  until users find two-line issues annoying.
- A shortened issue on a phone (the Jira key, the full text kept).
- The phone layout's entries growing from 0.8 to the deck card where every
  entry fits above the sheet: after step 4, with phone feedback.

## Decisions log

The reasons behind each rule, and what was set aside.

- **J1.** Windows laptops at 1366 by 768, or 1080p at 150%, leave about 600 to
  650 px once the taskbar and the browser are counted (estimated). Hand-resized
  windows also land at 665 and 757. Only the participant area pays for 600, and
  principle 4 already lets it scroll. 700 failed a 665 px window; 650 bought
  little over 600. A 990 by 665 window was set aside as not representative.
  3b1 split the target in two: the same argument cuts both ways, since a taller
  target costs a 600 px viewport only a scrolling table. Measured viewports:
  1344 by 757 and 1329 by 696 (one Mac laptop, two browsers), 1512 by 749 (a
  product owner's). 620 to 650 was set aside for the floor plus a provisional
  comfort target. The two-line condition: a 128-character link takes four
  lines, and the page then scrolls rather than hiding the table (3b1).
- **J2.** Shared from the laptop, the viewport is the target's, so legibility on
  a TV comes from the sizes at 1280 by 600; the fluid root only matters above
  it, where the whole layout scales together, which is principle 2's monitor
  case. Principle 5's first bullet was reopened to say so. Zoom shrinks the
  viewport in CSS px, so the `vmin` part shrinks as everything else grows, and
  alone it cancels the zoom: with `clamp(1rem, 2vmin, 1.75rem)` the monitor's
  text stayed flat from 125% to 200%. With the root `clamp(1rem, 1.05vmin +
  0.5rem, 1.75rem)`, 200% zoom doubles the text at J1's target and the hand
  checks below 800 px tall, 1280 by 952 doubles by the 250% step (Firefox's
  240%) and the 3072 by 1598 monitor by 400%, at 1.94 times on 300%, and every
  step grows it. WCAG 1.4.4 asks that text can be resized to 200% by any
  available means, browser zoom among them (failure F94), which the 2.5 bound
  guarantees. The shell's `100dvh` is a container, not a size: under browser
  zoom it equals the visible area. It is bounded in the wide layout, since the
  entry scale needs the table's box bounded. Browser zoom scales `px` too; what `px` misses is
  the fluid root, which would thin lines on a big shared screen. Hairlines stay
  in `px` because borders round to whole device pixels, and a thin `rem` border
  renders unevenly. Set aside: a root fluid at laptop sizes, which gave 1.6
  times the text at 200% zoom on 1344 by 757; fluid sizes on the shared-screen
  elements only, which left their spacing fixed; pure `vmin`, which ignores
  zoom; `rem` steps per media query, which jump; `height: 100%` chained down
  from `html`, which one wrapper breaks and phones' toolbars defeat; a `rem`
  height tuned to 600, which breaks when anything above it changes; a shell
  bounded everywhere, whose main region would scroll instead of the page; no
  `rem` term, which kept the monitor's text at 28 px rather than 24.8
  at the cost of the flat zoom band. 3b1 found `vmin` following the width on
  half a monitor, growing the text while narrowing the page: 1280 by 1300 gave
  60 rem, too narrow for the deck, and gives 69 with the height-first root;
  every landscape size J1 lists keeps its root. Set aside: a deck that shrinks
  below the breakpoint. 3b1 reopened principle 4's table: a notice, a longer
  issue or a window below the floor shrink the table to its 5 rem, then scroll
  the page, two scrollers at once. A notice shrinking the table was set aside
  before, as hiding the room while something is wrong; the banner panel is
  short, one banner keeps the floor still and the table keeps a strip of
  cards, and a bounded table keeps the entry scale steady. Set aside: the
  table flowing with the page in those rows, which rescales the entries as a
  banner appears and cannot see a three-line issue without a script. The tag's tracking and the tight point in "0.5" follow
  their own text, as the label tracking does, hence `em`.
- **J3.** What the room watches needs a shape read from afar; the rest needs
  words. Two looks and a pill were tried: a pill does not register at a glance
  for a reader with strong glasses, and a room mid re-vote then looks as if
  nobody had an opinion. Swapping the meaning (fill for any estimate, the pill
  for not confirmed) shows every card filled while the auto-reveal still
  waits. Set aside: words on every state, which repeat the shapes and cost
  width on 14 entries; icons with words, which Appendix A's improve 4 retires;
  a half fill, which pushes the figure out of line with the others; a dashed
  outline, too close to the plain one at video-tile size; a cross for "no
  vote", which reads as refused; a card back, which already means hidden;
  opting every mark or the kept frame out of forced colours, when a border and
  SVG need none; mark names fitted to today's substring reads ("Voted, vote
  hidden"), which writes them for the tests rather than the listener; "your
  last vote" on the card, a second wording for one state. The kept frame
  replaced the hatching in 3a: it reads as focused where hatching blurred, at
  full size and at the tile. Set aside: hatching; partial borders (top and
  bottom, left and right); a card band a fifth of a card width 3a would have
  had to guess before 3b's layouts. The pill was renamed the tag in 3a. 3b1:
  the revealed kept value's tag (about 100 px) does not fit a 78 px entry, and
  a band inside the face crushes "13" and "0.5", so the band sits outside the
  face; a revealed kept value marks a value to talk about, not a person at
  fault. Set aside: filled revealed faces, which put more ink beside the chart.
  The facilitators' summarizing line was chosen over a region after the
  voters, which costs a row.
- **J4.** lunatech.com uses burgundy for its primary button and its active
  state. As states, it would fill a room of 14 and hide the primary action.
  Ink on paper is about 17:1 for every vision type. Burgundy against ink is
  1.79 under protanopia, which is safe only because burgundy carries no state.
  Set aside: burgundy for states; the chosen card in burgundy and entries in
  ink, which gives one state two colours. A burgundy card back cannot fade
  within 7:1 (paper-warm on it 7.31 at full strength, 6.57 at 95%, at worst),
  hence the frozen card fades to the grey whatever the back; a blue back was
  set aside, a colour from outside the brand. 3b1 tried a burgundy back on the
  assembled mockups: it took the eye from the one primary action. Reopened by
  3b1's second look (C, below): the ink backs were the heavy black the
  designer called sad.
- **J5.** Showing Show while revealed re-reveals and republishes an identical
  snapshot (`RoomData.show`), so hiding it is presentation (principle 8).
  Re-voting and moving on happen about half each after a Show in the sessions
  observed, and a primary would nudge the room past a spread. Set aside: Show
  as a ghost while revealed, a look built to be thrown away; Clear as step 4's
  revealed primary, which colours the destructive button in one phase only; a
  separate step to hide Show; Next issue as the revealed primary; a primary
  chosen by the result, kept as a step 5+ candidate for the specialist. 3b1
  made Show and Re-vote one button in one place: a button alone in the middle
  read as floating, and two places left a gap that read as a misalignment.
  The server's re-vote has no guard and the command carries no phase, so a
  click meant for Show that lands once the button has changed (an
  auto-reveal, someone else's Show) would unconfirm the room; the 1 s window
  stops it, and covers a double-click too. A Re-vote already sent is the
  server's to refuse, a known issue. The window is `aria-disabled`, not a silent
  ignore: the tests' clicks wait for it, as a silent ignore would lose them, and
  native `disabled` would drop the focus to the page. Set aside: separate fixed places; a disabled
  Show while revealed, more content; a refusal window on the server; a
  centred toggle, which wraps below 70 rem and gives one tab order two visual
  orders. Next issue now precedes Re-vote, the toggle keeping the edge.
  Reopened by 3b1's second look (M, and the round bar's guard, below).
- **J6.** Burgundy-deep on the tint over paper is 10.75 (protanopia 11.99,
  deuteranopia 10.07, tritanopia 10.75); ink on paper-pale 14.77 to 14.78
  for all three. The two grounds are close in
  lightness, hence the icon and words. Set aside: four hues, which bring colours
  from outside the brand, red-green confusion and an amber that rarely reaches
  AAA, to split moved from restarted, which nobody acts on differently; ink
  only, which drops the red cue and is as loud as anything on the page. On
  3b1's paper-pale room page a notice's box vanished, its bar and icon alone
  telling it apart; in a panel it reads again, at about 40 px more than a bare
  banner while one shows, which principle 4 accepts. Set aside: a notice on
  paper-warm with a hairline, which gives the two tones two grounds.
  Reopened by 3b1's second look (Q, below): on white panels the wrapper's
  reason is gone, and the notice turned blue.
- **J7.** JetBrains Mono's figures are tabular and tell look-alikes apart.
  Instrument Serif has one light weight with thin strokes, which a lit
  projector and video compression eat. Self-hosting keeps visitors' addresses
  from Google, survives a proxy that blocks the CDN, and drops an outside
  dependency; the test suite's off-origin guard would also fail every case on a
  CDN font. Set aside: the serif for the issue; system fonts only; Space
  Grotesk, which the site uses only in places. Shared-screen text: cap height
  at least a two-hundredth of the distance, at 0.65 mm per CSS px measured on a
  40 inch TV, is 44 px of DM Sans (cap 0.70 em); a 3 m or a 5 m target set
  aside. 3b1 put the chart at 3 m, its 13 columns and counts fitting the slot
  at the floor; counts at the body size were set aside. Reopened by 3b1's
  second look (A and H, below): Inter, and the issue at a heading's size.
- **J8.** Principle 10 asks for it, and the brand's ink and paper make it cheap;
  only the muted grey needs replacing. Set aside: AA beyond the shared-screen
  elements, which allows the site's grey but falls short of principle 10; 7:1
  for every indicator, which makes each border heavy for no reading gain. The
  gap keeps the focus ring off every border and fill, so one ring passes
  everywhere. Set aside: a burgundy ring, 2.23:1 against an ink fill; a ring on
  the component's edge, which changes nothing where it covers an ink border;
  Bootstrap's shadow, faint and gone under forced colours. The simulations gate,
  since principle 10 promises every vision type the same floors; a 5% darker
  burgundy pays for it. Set aside: gating the true colours only, as WCAG does,
  which kept the site's exact value at the cost of an exception; burgundy links,
  2.23 against ink text and 6.63 on a message's ground. The frozen deck fades
  within 7:1 rather than below it, so the voter's own vote stays legible once
  revealed and the text floor has no exception; thin edges carry most of the
  disabled look. Set aside: a 4.5:1 exception for disabled cards. `--grey` is
  the lightest grey found on the site's mute hue at 7:1 on every ground under
  every vision, so one grey serves supporting text and the frozen deck. Set
  aside: italics and a smaller helper. The gate composites a ground with alpha
  in sRGB, rounded to 8 bits as the browser paints it, and applies the
  simulations in linear RGB; that method reproduces every figure in Brand
  source and the J6 log, and the gamma-space variant does not.
- **J9.** A projector or a video tile loses a shadow and a dark page's contrast
  in a lit room. A playing card's corner tells a card from a button; the site's
  corners are square. Set aside: a 1 px or a 2 px line everywhere. 3b1's room
  page sits on paper-pale so its panels read as what the page is about, what
  to do and who is doing it; strong panel titles were set aside. Reopened by
  3b1's second look (A, below): rounded corners and a soft shadow.
- **J10.** 3b1 decided on whole-page mockups, the reasons in its spec. Set
  aside: a main-and-side layout (8 of 12 entries, the deck in two rows); the
  deck at the bottom (the result at the screen's edge); the result below the
  table; the history in the header; rows for entries; "½" for 0.5. The
  breakpoint keeps no margin past the deck's tokens, since a margin of 0.3 rem
  sent half of a 2560 by 1440 monitor to the narrow layout whenever a classic scrollbar
  showed; `scrollbar-gutter: stable` was set aside, as it does so always. The
  table, though, keeps its gutter: a hand check in Chromium on Linux at 1461
  by 624 found its own classic scrollbar made two layouts true at one scale,
  one row without the bar, or 13 and 1 with it, balanced to a 7 and 7 that
  scrolls, the fit's search history picking between them. Reopened by 3b1's
  second look: the page keeps its gutter too, since the breakpoint fell to
  65.75 rem and half monitors sit at 69 to 73 rem (below).
- **3b1's second look (2026-10-12 to 14).** The designer and one user
  rejected the first mockup: "sad", almost no colour, no primary on the
  revealed screen, the issue too big, no sidebar. His Figma became the start,
  the first version's rules the constraints. The full record is in 3b1's spec
  and its plan, `docs/superpowers/plans/2026-10-14-ui-refresh-3b1-v2.md`.
  - **A. His visual language**: Inter, white rounded panels with a soft shadow
    on #F7F5F2. Set aside: tweaking the first look, which keeps what was
    rejected; a fresh exploration, which ignores his work.
  - **B. 7:1 for all text** stays: his muted grey was 4.41 and his dashed
    card 1.49, so his hues were darkened to pass. Set aside: 7:1 only for the
    shared screen; AA everywhere.
  - **C. Red marks** the toggle, the voted back and the most-voted bars;
    faces, figures, links and the focus ring stay ink. Set aside: red faces,
    which carry nothing in step 4; ink backs.
  - **D. His red family over burgundy**, the same hue. lunatech.com's October
    restyle is not a reference: it came without the designer.
  - **E. A participants sidebar now**: a balanced layout, the expected place
    for the room's people, colour that offsets the red, and room for the
    round history later; it lists every facilitator, however many.
  - **F. Only the planned later steps are drawn.** His statistics, the
    "share your reasoning" callout, the round counter and the coffee card are
    step 5+ candidates, credited to his mockup.
  - **G. The progress count** lives only in the round's place, small for a
    voter, big in the slot for a facilitator.
  - **H. The issue at a heading's size**, leaving principle 5's list: the room
    hears it, remote people read it, and at 44 px it dominated the page.
  - **I. Soft avatars**: initials in a hue hashed from the name, decoration
    that breaks up the red. Set aside: the state on the avatar, an icon alone.
  - **J. The histogram stays**, with a "Most voted" block and the other bars
    at 3:1; the tie rule waits for the ties step. Set aside: his row bars,
    whose height follows the spread and whose labels are too small to share.
  - **K and O. The phase word and the buttons in the round bar** at the
    column's foot: the buttons act on the round, not the deck. The phase line
    drops its sentence. f and g are a panel swap left to the users. Set aside:
    the header at the bottom, the buttons under the deck, no phase word, the
    phase line under the slot.
  - **L. #A31B26 stays** for the button and the chosen card; the bright
    variants broke B or convinced nobody. Reopened by 3a2 (decision 6): its
    figures were measured under normal vision only, and the gate's
    simulations darken it to #9B1A24, and a problem's text to #931822.
  - **M. From step 5, Clear · toggle · Next issue**, Next issue the primary
    once revealed, since the primary marks the way forward. No place is kept
    for it; the primary chosen by the result is dropped, the designer having
    chosen.
  - **N. Counts without "×"**: the bars cannot tell 1 from 2 votes at 3 m, so
    the counts stay; the "×" was clutter.
  - **Q. Banners full width under the header**, each its own panel, notices
    blue: the usual place for page-wide messages, and white with an ink bar
    was easy to miss among white panels. Set aside: the column's top, above
    the round bar, the sidebar's top, an ink or a grey notice.
  - **W. Deck cards shrink with the column**, down to the touch target, so
    the breakpoint falls from about 81 rem to 65.75 and both half monitors
    stay wide; a user's check at 1280 by 680 and down to 930 by 668 read well.
    Set aside: fixed cards; the sidebar giving way first, a third layout.
  - **The header mark**: the Lunatech glyph on his red card, a subtle accent.
    **The app's name stays**: "Pointing Poker" is the address's own words and
    helps a search find it. Both can change in a later branding change.
  - **Its review wave** brought: one guard on the whole round bar after any
    phase change, since a flip changes what a press at every place does
    (browsers guard their prompts the same way); the facilitator's table
    keeping the slot's height while voting, so the round bar stays put through
    a reveal; the page's gutter; a banner left above a scrolled view by
    scroll anchoring, rather than pulled into view under the pointer; "No
    issue yet" for an empty issue; banners on the common hairline, which
    follows `prefers-contrast: more`; "Link copied", for which the longest
    room id left 1 px; Copy link in ink. The facilitator's entries re-centre
    on a reveal until the progress count fills the slot, accepted, as cards
    centred in each phase were preferred to a fix that step would undo; the
    progress count became the first step 5+ candidate.
  - **Its final review** darkened the kept amber one step, to keep 7:1 for
    the own row's note on paper-pale, and named the chosen card's fill
    `--burgundy`, the one red fill with text.
  - **A comparison with the designer's draft** brought back the room chip's
    size: Copy link's 44 px target had filled the header and merged the chip
    into the page, so the target reaches past the link unseen. The issue
    panel keeps the side margin all round, whatever its number of lines, and
    one line takes the round bar's height, so the two bars match. The entries
    lose a little scale for it, 1.02 at the comfort target from 1.08.
- **Brand source.** blog.lunatech.com was considered: black and gold, its gold
  2.02 on its own light ground, so it works only as a dark page, which J9 rules
  out. A new palette was considered for accessibility and set aside, since ink
  on paper already gives the strongest contrast and J3 and J4 keep colour from
  carrying state.
- **Pass outcome.** The UI refresh design gained principle 8's definition of
  behaviour, principle 10, step 1c, step 4's hiding of Show and its wait on 1c,
  step 5 (Next issue), step 3's split into 3a and 3b, and the result-driven
  primary as a 5+ candidate. Appendix A stays the dated review it is.
- **3a.** The token values, the gate and the kept frame came with their own
  spec, `docs/superpowers/specs/2026-10-07-ui-refresh-3a-tokens-design.md`.
- **3a2.** The room page's tokens moved to the value source, checked by the
  gate, with their own spec,
  `docs/superpowers/specs/2026-10-14-ui-refresh-3a2-root-height-design.md`.
  A shadow is two tokens so that each file keeps one kind; a unit maps to the
  tokens that may use it; the root's `vw` term only lowers it; only colours a
  reader never needs skip a pair. Five values darkened to pass every vision,
  each by the least the gate allows. Set aside: a shadow kind in the gate,
  which adds a parser; shadows as literals, outside the value source; a
  viewport grid for the root, which turns the rules into samples; exempting
  the pip and the track; checking the simulations on shapes only, or
  exempting the button's white, either of which keeps #A31B26 by weakening
  the gate.
- **3b2.** The narrow and large room page came with its own spec,
  `docs/superpowers/specs/2026-10-15-ui-refresh-3b2-narrow-and-large-design.md`.
  Two switches, not three layouts, since the compact foot serves the wide
  layout below 65.75 rem as well as the phone layout. The cap at 106 rem is a
  1080p monitor's page, checked by hand: it caps 1440p, the user's screen and
  4K, for less eye travel. 51.75 rem is where the full header holds the
  longest room id with "Link copied", and a three-way tie, Next issue and the
  progress still fit the round bar (36 px bars at 840 px). Set aside: the
  roster's rows for the table, and both lists, on a phone; two header rows
  with every word, and an overlay menu; a flowing deck, low keys and the deck
  first; a frozen deck after a reveal, and a shrinking or centred slot; every
  round action as an icon, and a round menu; the round bar at the page's end;
  a single column from 46.75 rem; pinning at 47 rem tall; `scroll-padding` on
  `html`; Clear as an icon in the wide layout; no cap, and 120 or 140 rem;
  hiding "https://".
- **3b3.** The issue editor and the messages came with their own spec,
  `docs/superpowers/specs/2026-10-16-ui-refresh-3b3-issue-editor-and-messages-design.md`.
  The lobby's messages (the join and create failures, "Your session has
  ended") are 3b4's: each shows only over the lobby, which the product owner
  judges there. The stack follows the tone, as today's order did, with no
  arrival tracked; the editor's messages follow it too, the problem above the
  notice, where step 1a's code had the notice first by no rule. The field is a
  wrapping textarea so the whole issue stays visible, with Enter saving and a
  `oneLine` draft; Save and Cancel are beside it at and above 65.75 rem, where
  Edit was, and below it under, where 360 to 430 px left the field 178 to 248
  px beside them, as did the band's 232 px at 51.75 rem. Saving keeps focus on
  the buttons (`aria-disabled`), which closes the Save button's screen reader
  issue. Set aside: Dismiss on problems, and an
  always-rendered Messages section, which nothing today needs; the next
  banner's Dismiss as the focus target, dead outside a typed URL; a one-line
  input and a two-line capped field; the buttons below the field at every
  width, or beside it at every width; the editor's messages as banners in the
  Messages section, or as plain text under the field; and the notice above the
  problem.
- **3b4.** The lobby came with its own spec,
  `docs/superpowers/specs/2026-10-19-ui-refresh-3b4-lobby-design.md`, and folded
  in the not-a-room page, which is the same user's next screen. The
  lobby takes the room page's regions in one centred column of `--lobby-width`,
  a token added to the value source; `--card-back`'s comment names the row's
  square, a shape without text, which is why the square is not `--burgundy`;
  `--font-serif` left it with the gate's serif allowance, since J7 draws no
  serif and nothing used it. The tabs stay: nobody reaches `/` often, so
  restructuring them is its own step. The messages are banners, since a message
  inside the panel needs a second mechanism and "session ended" does not fit
  one; after it the panel stays and is inert, on `--paper-pale`, because the
  saving look's `--track` ground leaves grey text at 6.47:1. The rejoin row's
  name is its content, which keeps Label in Name with two lines; its arrow is
  ink, and burgundy only where the row is the page's one primary, so J4 and J8
  hold. The not-a-room page is built in React, so the row is one component and
  the lobby's tokens and fonts are shared, its entry shape left to step 4; the
  typed name is wrapped in a `<bdi>`. Set aside: a hero panel; restructured
  tabs; a segmented role bar; messages inside the panel; removing the form
  after "session ended"; burgundy links and arrows; a Reload button, a
  "Joining…" look and an accepted pasted URL (each its own decision); the
  rejoin row without its square (the three deferred variants, Open).
- **1c.** The test contract audit (the UI refresh design's step 1c)
  reopened its sign that a join reached the room, "Leave or the role line":
  3b2 puts both behind ☰ in the phone layout, where a case joins. The
  room's marker serves (Contract reads). Set aside: the room id as a
  heading, which a lobby giving the id a heading would pass; Edit issue;
  the round region, absent from today's page.
- **4b.** The round bar's toggle and guard (the UI refresh design's step 4b)
  reopened J5's set-aside "a separate step to hide Show": Show is now hidden
  by becoming the toggle, and the toggle needs the guard, a behaviour judged
  by its own cases. Set aside: hiding Show inside the restyle.
- **4c1-foundation.** The stylesheets and the fonts (the UI refresh design's
  step 4c1-foundation) reopened J7's "Step 4 keeps a late font load from
  shifting the page", which had no recorded reason. The room is one page view
  kept for a whole meeting, so `font-display: optional` would draw it in the
  fallback for all of that meeting after one slow load; a late font now swaps in
  once. Set aside: `optional`; `block`, which hides late text up to about 3 s
  and jumps just the same; a fallback scaled to Inter's size, which narrows the
  jump without removing it.
- **4c1-editor.** The editing view (the UI refresh design's step 4c1-editor)
  reopened two of 3b3's choices. The saving look takes the lobby's inert look,
  as Save in `--grey` on `--track` was 6.47:1, under J8's 7:1, and one inert
  look serves the app; revisited after the stack is deployed. The script fit
  goes: every current browser has `field-sizing`, Firefox ESR 140 having ended.
  Set aside: a white fill, a second inert look; a fallback script no CI browser
  runs.
- **Review.** A review with three lenses (the code, consistency, accessibility)
  brought: the contract reads; step 1c's failing cases; J3's three looks,
  facilitators apart and forced-colours marks; the offset ink focus ring; the
  simulations as a gate and a darker burgundy; the frozen deck within 7:1; J2's
  zoom bounds and the shell's `100dvh`; J5's destructive rule; the Tokens
  section; hairlines by role; L1 to L11. The revealed form waits on L3. A second
  pass (facts, consistency) brought: principle 5 reworded for J2; the shell
  bounded only where the page must not scroll; a `rem` term in the root; one
  mark per look, the mark reads a step 4 contract change; one wording for the
  kept state; one forced-colours opt-out, its ring in `CanvasText`; the
  facilitator region within principle 4; the Lines tokens. A third and a fourth
  pass (failure modes, simplicity, the code) brought: principle 4 as one table
  in viewport terms, which J2, L10 and L11 point to, as each restatement had
  drifted; the card's pill outside its button; the mark names stated once, in
  J3; the revealed marks read in the session case; the straggler's "Vote hidden"
  read kept as a `votedMark` read.
