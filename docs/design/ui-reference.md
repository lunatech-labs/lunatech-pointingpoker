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
- **Shared-screen elements**: the issue, the progress and the result
  (principle 5).
- **Card**: one of the deck's 13 buttons, which a voter clicks to vote.
- **Participant entry**: one voter in the participant area, today a table row;
  its form is L3's. Facilitators are listed apart (J3).
- **Hairline**: a divider or a surface's edge, and nothing else. It is
  decorative: it identifies no control and no state.
- **Message**: anything J6 gives a tone: a problem, a notice or a
  confirmation. Principle 4's notices are the first two.
- **Banner**: as in the UI refresh design's Appendix C.

## Mockups

- They will live beside this file, under `docs/design/`, as clickable HTML.
- They show what step 4 builds and, behind a "later steps" toggle, the parts
  later steps add (progress count, Next issue, the spread), so step 4 leaves
  room for them.
- They include a re-vote, where the kept look shows (J3), and a reveal with a
  kept vote.

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

## Rules

### J1. Target laptop height

- The laptop target is a viewport of **1280 by 600** CSS px, which step 4's
  no-scroll case uses. It may relax to about 620 to 650 if that buys a clearly
  better layout, said so when proposed.
- "Fits" is measured with the root font size J2 gives at that viewport.
- Hand checks in 3b: 1344 by 757, 1536 by 756, 1280 by 952, and 3072 by 1598 as
  the monitor case.

### J2. One fluid root, everything else in rem

- The root font size is the only fluid value:
  `clamp(<min>rem, <a>vmin + <b>rem, <max>rem)`, the `--root-size` token,
  which the contrast gate (J8) checks against the three rules below. Its limits
  are in `rem`, so the reader's default font size counts.
- The root sits at its minimum up to the laptop sizes (J1's target and hand
  checks below 800 px tall), so browser zoom there is exactly linear.
- `b` is above zero, so every zoom step grows the text at every viewport.
- `max` is at most 2.5 times `min`, so text reaches twice its size within
  Chromium's and Firefox's 500% zoom at any viewport.
- Every other size is in `rem`. No viewport unit appears outside the root but
  the app shell's height: exactly `100dvh` where principle 4's table says the
  page never scrolls, and at least `100dvh` in its other rows.
- `px` only for the hairline token and inside a pixel floor. Every other line
  (the Lines tokens but the hairline: control lines, J3's marks, the kept
  frame's band, message bars, the focus ring) is in `rem` with a pixel floor,
  such as `max(2px, 0.125rem)`, so it scales with the root and never rounds to
  nothing. The gate checks the units in `tokens.css`.

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
| Kept | kept frame | the value and a "not confirmed" tag |

| Card | Shown as |
| --- | --- |
| Not chosen | plain |
| Chosen, confirmed | solid fill |
| Chosen, kept | the kept frame around the figure, and a "not confirmed" tag |
| Revealed | all disabled, the phase line says why; the chosen one keeps its look, fill or kept frame, faded to the grey (J8) |

- Three looks answer the room's two questions at a glance: who has chosen
  again, and whether enough estimates exist for a reveal to mean something.
- No tag on a kept entry while voting: the kept frame carries it, and the
  accessible name says it.
- **Solid fill** and the **kept frame** are each defined once, on entries and
  cards alike, both in the card back's colour (J4). The solid fill covers the
  mark or the card. The kept frame is a solid band around a paper centre: on a
  card the band is `--frame-band`, a fixed line; on an entry it is a fifth of
  its mark's width in the mark's viewBox, the stroke inset. The frame surrounds
  a card's figure, so the figure stays on paper and in line with the others.
  Outline, kept frame and fill read as no fill, some, full: no estimate, kept,
  confirmed.
- A card's size is 3b's, with a token 3b adds: a kept card shows its widest
  figure inside the band with room around it (L5).
- The card's tag is `aria-hidden`: its hidden description, "Previous vote,
  not confirmed", already says it. It sits outside the button, in the card's
  wrapper beside that description, so the button's text stays the figure
  (see "Contract reads").
- 3b checks the kept frame on screenshots shrunk to a 480 by 270 video tile,
  and from a few metres away, on the smallest entry mark too (L3). If it fails
  there, 3b sends the band back to 3a (Tokens).
- **Facilitators** have no round state, so they are listed in their own region
  under one heading, in step 1b's order, and no entry carries a "Facilitator"
  label. The region sits inside the participant area, after the voters, or is
  one line that summarizes ("Facilitators: Ann, Bob and 2 more"), so principle
  4's growth rule holds; L3 picks.
- Each look has one mark with an accessible name, written for the listener
  (WCAG 1.1.1, and 4.1.2 for a card's state), one wording per state: "No
  vote", as on the revealed "–"; "Voted"; and "Previous vote, not confirmed",
  as on the kept card. Step 4 rewrites the mark reads to match (see "Contract
  reads").
- Marking a revealed kept value on entries is new; the voter's own card already
  marks it. It shows data the view already has, and adds no behaviour.
- **Forced colours** (Windows' contrast themes) repaint backgrounds, which
  would erase the fill:
  - a card's kept frame is its border, and an entry's mark is inline SVG drawn
    in an inherited `currentColor`; the browser repaints both in the user's
    colours with no opt-out;
  - a card's solid fill is the one opt-out (`forced-color-adjust: none`),
    drawn only in system colours (`Canvas`, `CanvasText`), since nothing else
    keeps a figure readable on a fill;
  - 3b checks each look under Chromium's forced-colors emulation, a focused
    card included.

### J4. Burgundy never carries a round state

- Burgundy marks the brand and at most one primary action per phase, and in
  its deep shade a problem message (J6).
- Every J3 state is drawn in the card back's colour, `--card-back`, which is
  ink. 3b tries burgundy on the assembled mockups and the product owner
  chooses; burgundy would reopen this rule.
- The focus ring is ink (J8). Links are ink and always underlined, so they
  never rely on colour and burgundy never sits in running text.

### J5. The round's actions per phase

A button shows only in the phases where it does something.

| Phase | Step 4 | Step 5 (Next issue) |
| --- | --- | --- |
| Voting | **Show votes** primary; Clear votes quiet | **Show votes** primary; Next issue quiet, if it shows while voting; Clear: step 5 decides |
| Revealed | Re-vote secondary; Clear votes quiet | Re-vote and Next issue, both secondary; Clear: step 5 decides |

- After a Re-vote the round is voting again, with the voting buttons.
- **Show** is the Show votes button, **Clear** the Clear votes one.
- **Primary** is the phase's one burgundy button (J4); **secondary** an ink
  outline; **quiet** an ink button with words and an icon, never burgundy.
- Step 4 hides Show while revealed, listed in its spec as a contract change,
  after step 1c has removed Show's incidental uses.
- Re-vote still shows only while revealed, a guard principle 8 carries over.
- The revealed phase has no primary. Its two actions stand as equals, in the
  workflow's order: Re-vote, then Next issue.
- An action is **destructive** when it discards votes nobody has seen: Clear
  while voting, and Next issue while voting. It is marked by its words, its
  quiet look and its distance from the phase's other actions, never by colour
  or a confirmation (Appendix A, avoid 6). Step 4 keeps Clear quiet in every
  phase.
- Clear stays until Next issue exists.
- Step 4 places the buttons where step 5 needs them, so swapping them by phase
  moves nothing.
- Next issue's flow, an assumption for the mockups only: the editor opens empty
  and focused, saving starts the new round, cancelling changes nothing.
- What step 5 decides is listed in its section of the UI refresh design.
- Placements and colours stay open until the mockups, and the specialist's
  critique may move them.

### J6. Message tones

The tone is carried by the icon and the words; the colour of the box and its
bar only reinforce them.

| Tone | For | Look |
| --- | --- | --- |
| Problem | something failed or broke: the connection lost, the session ended, a join, create or save failed | burgundy-deep text on the burgundy tint, a burgundy-deep bar, an icon |
| Notice | something changed to know about: the moved link, the restart ("Reconnected. Please check your vote."), the issue changed by someone else | ink on paper-pale, an ink bar, an icon |
| Confirmation | the user's own action done: "Link copied to clipboard" | plain text beside its cause, no box |

### J7. Type, self-hosted

- JetBrains Mono for figures (cards, results, values) and the room id.
- DM Sans for all other text, the issue included.
- Instrument Serif at most for the app's name in the lobby (L9).
- The app serves the fonts, not Google's CDN. All three families are SIL OFL
  1.1 with no Reserved Font Name (google/fonts, `OFL.txt` and `METADATA.pb`),
  so subsetting and woff2 need no renaming, and the licence text ships beside
  the files.
- **Shared-screen text** is sized for 4 m on a 40 inch TV at the laptop
  target: the `--text-3xl` step, 44 px. 3b may drop one element to the 3 m
  step, `--text-2xl`, said so in the log.
- Step 4 keeps a late font load from shifting the page.

### J8. Contrast floor

- All text at AAA, 7:1, large text included (AAA asks 4.5 there), on every
  ground it sits on: help lines, labels, placeholders and links included.
  Supporting text is `--grey`, at the body size; the hierarchy comes from a
  600-weight lead in ink. No text is italic.
- Other indicators at 3:1 at least (WCAG 1.4.11), a line that identifies a
  control included. Hairlines are decorative and exempt.
- **Focus** is an ink `outline`, at least 2 px thick and offset by a gap of at
  least 2 px, `--focus-width` and `--focus-gap` (J2); never a `box-shadow`,
  which forced colours remove. On every ground it meets both WCAG tests: 2.4.13
  (AAA), an area at least a 2 px perimeter with 3:1 between the focused and
  unfocused pixels, and 1.4.11, 3:1 against what touches it. On the one
  forced-colours opt-out (J3), it is `CanvasText`.
- Focus is never hidden behind a banner or the scrolled participant area
  (2.4.12).
- Under `prefers-contrast: more`, the hairline colour turns `--mute-soft`, an
  indicator at 3:1, and the control line takes the mark line's weight.
- The frozen deck keeps every figure at 7:1, under every simulation too, though
  WCAG exempts disabled controls. Its figures and the chosen card's fill or
  frame fade to `--grey`, whatever the card back, and the unchosen cards' edges
  may use the hairline's width and colour tokens, which 1.4.11 allows on a
  disabled control; the phase line says why it is frozen. Nothing fades under
  forced colours.
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
- **Surfaces**: the page on paper, content surfaces on paper-warm, told apart
  by a hairline, not a shadow.
- **No dark sections**: one light theme (principle 6).
- **Shapes**: lunatech.com's, as measured on 2026-10-07: corners square but the
  scrollbars' 2 and 3 px and the 50% dots; 1 px lines; 2 and 3 px burgundy
  bars; a 2 px focus outline, offset 2 px; transitions of 0.18 to 0.25 s;
  buttons at least 44 px tall, kept as `--target-min`.
- **Corners** are square but on cards, the deck's and L3's card entries, which
  take `--radius-card`. Buttons, inputs, surfaces, messages and the "not
  confirmed" tag stay square.
- **Two line weights**: controls keep the brand's 1 px line, `--line-control`;
  J3's marks take 2 px, `--line-mark`; both within J8's 3:1 for indicators.

## Tokens

The value source (Terms) holds every token's value and purpose; this section
keeps the kinds and the rules, and no value is written twice. Every colour,
size, font and duration in a component's CSS comes from a token (principle 6
for colours), except CSS keywords such as system colours and `currentColor`,
and L11's values in media queries, which cannot read a token.

| Kind | Tokens |
| --- | --- |
| Colour | the papers, pale and ink (Brand source), the supporting grey (J8), the app's burgundy and its tint, burgundy-deep, the hairline colour and its `more` value (J8), the card back (J4) |
| Root | the clamp (J2) |
| Shell | its height (J2) |
| Type | the families (J7); the scale's steps, the weights, the leadings, the label tracking |
| Spacing | one scale |
| Shape | the radii (J9); the least target size |
| Lines | the hairline in `px`; the control line, the mark line, the kept frame's band, the message bar, the focus ring and its gap (J2, J8) |
| Motion | the one duration (J9) |

- Nothing imports the value source before step 4; 3b's mockups link both
  files. The gate (J8) also checks what each file may hold, and J2's root.
- An alias exists only where its value can differ from its source, such as the
  card back.
- The type scale is named by steps, not roles, so 3b assigns a step to an
  element without renaming a token. It is provisional until 3b's assembled
  mockups judge it.
- 3b may add a token a layout needs: it adds it to the value source, and its
  reason to the log.
- 3b may send a value back to 3a, the change recorded in the log. A layout that
  does not fit at 600 tries J1's relaxation first.
- A derived value, such as a pixel floor, lives in a token's definition, never
  as a literal in a component.

## Contract reads the look keeps

The test contract (principle 9) reads these today, in `e2e/fixtures.js` and
the cases. A look that changes one lists it in step 4's contract changes.

- The text "Facilitator" inside a facilitator's entry (`facilitatorMark`), and
  one list holding every participant (`participantEntries`). J3's facilitator
  region changes both, a contract change of step 4.
- Images named "Voted" and "Vote hidden" (`votedMark`, `hiddenMark`), matched as
  case-insensitive substrings, since neither read sets `exact`. A confirmed
  entry carries both while voting and "Voted" once revealed; a kept one only
  "Vote hidden" while voting. J3's named marks change them, a contract change of
  step 4: each mark is read by its exact name. `hiddenMark` becomes the kept
  mark's read, which serves the read after a Re-vote and, since only
  `hasEstimation` gives that look, proves it survives redaction. On a confirmed
  entry, the reads of "Vote hidden" are dropped where a read of "Voted" or of
  the value sits beside them; the last, in `stragglerDepartsWithVotesHidden`,
  the only proof that the votes survive a departure, becomes a `votedMark` read.
  Step 1c moves every read of "Voted" on a revealed entry to the value (its list
  names the cases).
- The kept card's description, "Previous vote, not confirmed"
  (`unconfirmedCard`), from a hidden note, and the card's text, its figure
  alone (`toHaveText('5')`). J3's tag, `aria-hidden` and outside the button,
  leaves both unchanged.
- A revealed entry's `participant-estimation` holds the value and nothing else,
  empty for no vote (`revealedEstimation`, `expectSummaryMatchesParticipants`).
  J3's "–" and "not confirmed" sit outside it. Step 4 adds a read of both, a
  contract addition: at the third reveal of 'a session of rounds keeps the
  summary honest across them', Alice and Bob kept, Carol confirmed and Dave with
  no estimate, only Alice's and Bob's entries carry the kept mark, and only
  Dave's the no-vote mark, each read by J3's name.
- The room id as a heading, any level (`lobby.spec.js`).
- The copy hint's text, "Link copied to clipboard".

## Open

The layout questions 3b decides, on mockups of each layout cell.

- **L1. Each page's structure per phase**, the phase line included. A
  50-character ticket link fits the issue's one line at the laptop target, at
  J7's shared-screen size; a longer issue wraps, never truncated, until a
  clickable-link step brings an ellipsis that keeps the link's end.
- **L2. How progress is shown.**
- **L3. A voter's entry: a row or a card with the name under it**, and the
  participant area's thresholds. Rows fit more people and longer names; cards
  make the state and the values readable from afar, and turn face up on a
  reveal. Decided on whole-page mockups at 1280 by 600 with 14 people. The
  revealed entries' form follows: whether the marks stay around the value, or
  the cards turn face up. Also where the facilitator region sits, within J3's
  two choices. The kept frame is checked on the smallest entry mark (J3).
- **L4. Results**: scroll or summarise, and the later-steps spread toggle.
- **L5. How the deck reflows** on narrow screens and phones, and the card's
  size (J3). A card fits its widest figure, "0.5"; for a narrower card, every
  shown `0.5` may read "½" instead, a contract change of step 4: the card's
  name, and the `most-voted`, `tally-value` and `participant-estimation` text,
  which `expectSummaryMatchesParticipants` compares, all through one display.
- **L6. The room page's header**, the copy hint and the role line. The app's
  name may leave it: no case reads it, the tab title carries it, and the 600 px
  budget wants the room. Today's headings skip levels: the name is an `<h2>`,
  the room id an `<h5>`, "Your estimation" and "Most voted estimation" `<h6>`.
  L6 gives the page an ordered heading structure, the room id staying a heading
  (see "Contract reads").
- **L7. The issue editor** and its messages, within L1's one-line issue.
- **L8. The banners.**
- **L9. The lobby.**
- **L10. The monitor's width cap**, and how the shared-screen elements stay in
  view where the page may scroll (principle 4's table).
- **L11. Width breakpoint and height floor** (principle 4's table). The
  breakpoint sits clear of common window widths, such as 1280, rather than on
  them. Media queries in `rem` resolve against the reader's default size, not
  the fluid root.

## Decisions log

The reasons behind each rule, and what was set aside.

- **J1.** Windows laptops at 1366 by 768, or 1080p at 150%, leave about 600 to
  650 px once the taskbar and the browser are counted (estimated). Hand-resized
  windows also land at 665 and 757. Only the participant area pays for 600, and
  principle 4 already lets it scroll. 700 failed a 665 px window; 650 bought
  little over 600. A 990 by 665 window was set aside as not representative.
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
  zoom it equals the visible area. It is bounded only where principle 4's table
  says the page never scrolls. Browser zoom scales `px` too; what `px` misses is
  the fluid root, which would thin lines on a big shared screen. Hairlines stay
  in `px` because borders round to whole device pixels, and a thin `rem` border
  renders unevenly. Set aside: a root fluid at laptop sizes, which gave 1.6
  times the text at 200% zoom on 1344 by 757; fluid sizes on the shared-screen
  elements only, which left their spacing fixed; pure `vmin`, which ignores
  zoom; `rem` steps per media query, which jump; `height: 100%` chained down
  from `html`, which one wrapper breaks and phones' toolbars defeat; a `rem`
  height tuned to 600, which breaks when anything above it changes; a shell
  bounded everywhere, whose main region would scroll instead of the page; a
  notice shrinking the participant area, which hides the room while something is
  wrong; no `rem` term, which kept the monitor's text at 28 px rather than 24.8
  at the cost of the flat zoom band.
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
  had to guess before 3b's layouts. The pill was renamed the tag in 3a.
- **J4.** lunatech.com uses burgundy for its primary button and its active
  state. As states, it would fill a room of 14 and hide the primary action.
  Ink on paper is about 17:1 for every vision type. Burgundy against ink is
  1.79 under protanopia, which is safe only because burgundy carries no state.
  Set aside: burgundy for states; the chosen card in burgundy and entries in
  ink, which gives one state two colours. A burgundy card back cannot fade
  within 7:1 (paper-warm on it 7.31 at full strength, 6.57 at 95%, at worst),
  hence the frozen card fades to the grey whatever the back; a blue back was
  set aside, a colour from outside the brand.
- **J5.** Showing Show while revealed re-reveals and republishes an identical
  snapshot (`RoomData.show`), so hiding it is presentation (principle 8).
  Re-voting and moving on happen about half each after a Show in the sessions
  observed, and a primary would nudge the room past a spread. Set aside: Show
  as a ghost while revealed, a look built to be thrown away; Clear as step 4's
  revealed primary, which colours the destructive button in one phase only; a
  separate step to hide Show; Next issue as the revealed primary; a primary
  chosen by the result, kept as a step 5+ candidate for the specialist.
- **J6.** Burgundy-deep on the tint over paper is 10.75 (protanopia 11.99,
  deuteranopia 10.07, tritanopia 10.75); ink on paper-pale 14.77 to 14.78
  for all three. The two grounds are close in
  lightness, hence the icon and words. Set aside: four hues, which bring colours
  from outside the brand, red-green confusion and an amber that rarely reaches
  AAA, to split moved from restarted, which nobody acts on differently; ink
  only, which drops the red cue and is as loud as anything on the page.
- **J7.** JetBrains Mono's figures are tabular and tell look-alikes apart.
  Instrument Serif has one light weight with thin strokes, which a lit
  projector and video compression eat. Self-hosting keeps visitors' addresses
  from Google, survives a proxy that blocks the CDN, and drops an outside
  dependency; the test suite's off-origin guard would also fail every case on a
  CDN font. Set aside: the serif for the issue; system fonts only; Space
  Grotesk, which the site uses only in places. Shared-screen text: cap height
  at least a two-hundredth of the distance, at 0.65 mm per CSS px measured on a
  40 inch TV, is 44 px of DM Sans (cap 0.70 em); a 3 m or a 5 m target set
  aside.
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
  corners are square. Set aside: a 1 px or a 2 px line everywhere.
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
