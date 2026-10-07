# UI Reference

Date: 2026-10-07
Status: In discussion (step 3 of `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`)

The design reference step 4 applies. Step 3a fills the token values, step 3b
the layouts. Decisions are provisional unless marked **(settled)**, as in the
UI refresh design's "How decisions are marked". The rules come first; the
reasons and the options set aside are in the decisions log at the end.

## Terms

- **Token**: a CSS custom property in the token list (principle 6 for
  colours).
- **Token list**: the "Tokens" section, each token with its value and purpose.
  It is the contract between 3a, which gives the values, and 3b, which uses
  them.
  "Role" is not used for this, since voter and facilitator own the word.
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
  so the app's burgundy is about 5% darker, such as `#8E292E` (7.14 and 7.43);
  3a sets the value (J8).

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
  `:root { font-size: clamp(<min>rem, <a>vmin + <b>rem, <max>rem) }`, values
  from 3a. Its limits are in `rem`, so the reader's default font size counts.
- The root sits at its minimum up to the laptop sizes (J1's target and hand
  checks below 800 px tall), so browser zoom there is exactly linear.
- `b` is above zero, so every zoom step grows the text at every viewport.
- `max` is at most 2.5 times `min`, so text reaches twice its size within
  Chromium's and Firefox's 500% zoom at any viewport.
- Every other size is in `rem`. No viewport unit appears outside the root
  but the app shell's height: exactly `100dvh` wherever principle 4's table
  says the page never scrolls, so the participant area scrolls in its own
  region, and at least `100dvh` elsewhere. 3b turns this into L11's media
  queries and a rule on the shell while a message shows.
- `px` only for the hairline token. Every other line (the Lines tokens but the
  hairline: control lines, message bars, the focus ring) is in `rem` with a
  pixel floor, such as `max(2px, 0.15rem)`, so it scales with the root and never
  rounds to nothing.

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
| No estimate | outline | "–" in the value's place, named "no vote" |
| Confirmed | solid fill | the value |
| Kept | hatching | the value and a "not confirmed" pill |

| Card | Shown as |
| --- | --- |
| Not chosen | plain |
| Chosen, confirmed | solid fill |
| Chosen, kept | a hatched frame around the figure, and a "not confirmed" pill |
| Revealed | all disabled, the phase line says why; the chosen one keeps its look, fill or hatched frame; faded within J8 |

- Three looks answer the room's two questions at a glance: who has chosen
  again, and whether enough estimates exist for a reveal to mean something.
- No pill on a kept entry while voting: the hatching carries it, and the
  accessible name says it.
- **Solid fill** and **hatching** are each defined once, on entries and cards
  alike. The hatching frames a card's figure, so the figure stays on paper and
  in line with the others.
- The card's pill is `aria-hidden`: its hidden description, "Previous vote,
  not confirmed", already says it. It sits outside the button, in the card's
  wrapper beside that description, so the button's text stays the figure
  (see "Contract reads").
- 3b checks the hatching on screenshots shrunk to a 480 by 270 video tile, and
  from a few metres away.
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
- **Forced colours** (Windows' contrast themes) repaint backgrounds and drop
  gradients, which would erase the fill and the hatching:
  - an entry's mark and a card's hatched frame are inline SVG drawn in an
    inherited `currentColor`, which the browser repaints in the user's colours
    with no opt-out;
  - a card's solid fill is the one opt-out (`forced-color-adjust: none`),
    drawn only in system colours (`Canvas`, `CanvasText`), since nothing else
    keeps a figure readable on a fill;
  - 3b checks each look under Chromium's forced-colors emulation, a focused
    card included.

### J4. Burgundy never carries a round state

- Burgundy marks the brand and at most one primary action per phase, and in
  its deep shade a problem message (J6).
- Every J3 state is drawn in ink.
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
- The app serves the fonts, not Google's CDN. 3a confirms the licence of all
  three families allows it.
- Step 4 keeps a late font load from shifting the page.

### J8. Contrast floor

- All text at AAA, 7:1, large text included (AAA asks 4.5 there), on every
  ground it sits on: help lines, labels, placeholders and links included.
  Supporting text is told by size and weight, or by a grey 3a computes to reach
  7:1.
- Other indicators at 3:1 at least (WCAG 1.4.11), a line that identifies a
  control included. Hairlines are decorative and exempt.
- **Focus** is an ink `outline`, at least 2 px thick and offset by a gap of at
  least 2 px, both in `rem` with a floor (J2); never a `box-shadow`, which
  forced colours remove. On every ground it meets both WCAG tests: 2.4.13
  (AAA), an area at least a 2 px perimeter with 3:1 between the focused and
  unfocused pixels, and 1.4.11, 3:1 against what touches it. On the one
  forced-colours opt-out it is `CanvasText` (J3).
- Focus is never hidden behind a banner or the scrolled participant area
  (2.4.12).
- Under `prefers-contrast: more`, hairlines and the hatching darken, to values
  3a gives as tokens.
- The frozen deck keeps every figure at 7:1, under every simulation too, though
  WCAG exempts disabled controls. Its figures and the chosen card's fill or
  frame may fade toward paper only that far (about `#5A5553`, a 3a token), and
  the unchosen cards' edges may use the hairline token's width and colour, which
  1.4.11 allows on a disabled control; the phase line says why it is frozen. 3b
  picks the level on the mockups, and whether the fill fades. Nothing fades
  under forced colours (J3).
- 3a's script checks each text and indicator colour at its floor on every ground
  it can sit on: paper, paper-warm or white, paper-pale, the burgundy tint over
  each surface a message sits on, the ink fill (a confirmed card's figure), the
  faded fill (a frozen chosen card's figure) and burgundy (the primary's label).
  The colour-blind simulations (Machado 2009, full severity) are a gate at the
  same floors, not a report.

### J9. Motion, surfaces and shapes

- **Motion**: only small transitions, such as entries turning on a reveal and a
  button changing state, each at most 200 ms, and none under
  `prefers-reduced-motion`. Motion never carries information alone.
- **Surfaces**: the page on paper, content surfaces on paper-warm or white
  (3a's choice), told apart by a hairline, not a shadow.
- **No dark sections**: one light theme (principle 6).
- **Shapes**: lunatech.com's corner radius and border widths, measured in 3a
  and turned into the Shape and Lines tokens (J2), within J8's 3:1 for
  indicators.

## Tokens

3a fills this list with each token's name, value and purpose. Every colour,
size, font and duration in a component's CSS comes from it (principle 6 for
colours), except CSS keywords such as system colours and `currentColor`.

| Kind | Tokens |
| --- | --- |
| Colour | paper, paper-warm or white (J9), paper-pale, pale for hairlines, ink, a supporting-text grey at 7:1 (J8), the app's burgundy (Brand source), burgundy-deep, the burgundy tint, the frozen-deck grey (J8), or the supporting grey if 3a finds one serves both |
| Root | the clamp's minimum, `vmin` and `rem` terms, and maximum (J2) |
| Shell | its height, `100dvh` (J2) |
| Breakpoints | L11's width breakpoint and height floor, written as literals in the media queries, since a media query cannot read a token; listed here with their values |
| Type | the families (J7); the scale, the weights |
| Spacing | one scale |
| Shape | corner radii (J9) |
| Lines | the hairline in `px`; the control line (outlines, card edges, marks, frames); the message bar; the focus ring and its gap (J2, J8) |
| Pattern | the hatching's angle, stripe and gap (J3) |
| Motion | the one duration (J9) |

- 3b may add a token a layout needs: it adds it here, and its reason to the
  log.
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
  `hasEstimation` gives that look, proves it survives redaction. The reads of
  "Vote hidden" on a confirmed entry are dropped, as the value's absence or
  presence is read beside each. Step 1c moves every read of "Voted" on a
  revealed entry to the value (its list names the cases).
- The kept card's description, "Previous vote, not confirmed"
  (`unconfirmedCard`), from a hidden note, and the card's text, its figure
  alone (`toHaveText('5')`). J3's pill, `aria-hidden` and outside the button,
  leaves both unchanged.
- A revealed entry's `participant-estimation` holds the value and nothing else,
  empty for no vote (`revealedEstimation`, `expectSummaryMatchesParticipants`).
  J3's "–" and "not confirmed" sit outside it. Step 4 adds a read of both, a
  contract addition: at the third reveal of 'a session of rounds keeps the
  summary honest across them', Alice and Bob kept, Carol confirmed and Dave
  with no estimate, only Alice's and Bob's entries carry "not confirmed", and
  only Dave's "no vote".
- The room id as a heading, any level (`lobby.spec.js`).
- The copy hint's text, "Link copied to clipboard".

## Open

The layout questions 3b decides, on mockups of each layout cell.

- **L1. Each page's structure per phase**, the phase line included.
- **L2. How progress is shown.**
- **L3. A voter's entry: a row or a card with the name under it**, and the
  participant area's thresholds. Rows fit more people and longer names; cards
  make the state and the values readable from afar, and turn face up on a
  reveal. Decided on whole-page mockups at 1280 by 600 with 14 people. The
  revealed entries' form follows: whether the marks stay around the value, or
  the cards turn face up. Also where the facilitator region sits, within J3's
  two choices.
- **L4. Results**: scroll or summarise, and the later-steps spread toggle.
- **L5. How the deck reflows** on narrow screens and phones.
- **L6. The room page's header**, the copy hint and the role line. The app's
  name may leave it: no case reads it, the tab title carries it, and the 600 px
  budget wants the room. Today's headings skip levels: the name is an `<h2>`,
  the room id an `<h5>`, "Your estimation" and "Most voted estimation" `<h6>`.
  L6 gives the page an ordered heading structure, the room id staying a heading
  (see "Contract reads").
- **L7. The issue editor** and its messages.
- **L8. The banners.**
- **L9. The lobby.**
- **L10. The monitor's width cap**, and the shared screen zoomed, where the
  page may scroll but the issue, the progress and the result stay in view
  (principle 4's table).
- **L11. Width breakpoint** between the narrow and the wide layout, and the
  height floor below which the page may scroll (principle 4's table, J2). It
  sits clear of common window widths, such as 1280, rather than on them. Media
  queries in `rem` resolve against the reader's default size, not the fluid
  root.

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
  text stayed flat from 125% to 200%. With the example `clamp(1rem, 1.05vmin +
  0.5rem, 1.75rem)`, 200% zoom doubles the text at J1's target and the hand
  checks below 800 px tall, 1280 by 952 doubles by the 250% step (Firefox's
  240%) and the 3072 by 1598 monitor by 400%, at 1.94 times on 300%, and every
  step grows it. WCAG 1.4.4 asks that text can be resized to 200% by any
  available means, browser zoom among them (failure F94), which the 2.5 bound
  guarantees. The shell's `100dvh` is a container, not a size: under browser
  zoom it equals the visible area. It is bounded only where principle 4's table
  says the page never scrolls; J2 points to that table, as three passes restated
  its conditions and each drifted, the last making a message shrink the
  participant area, to nothing at 600. Browser zoom scales `px` too; what `px`
  misses is the fluid root, which would thin lines on a big shared screen.
  Hairlines stay in `px` because borders round to whole device pixels, and a
  thin `rem` border renders unevenly. Set aside: a root fluid at laptop sizes,
  which gave 1.6 times the text at 200% zoom on 1344 by 757; fluid sizes on the
  shared-screen elements only, which left their spacing fixed; pure `vmin`,
  which ignores zoom; `rem` steps per media query, which jump; `height: 100%`
  chained down from `html`, which one wrapper breaks and phones' toolbars
  defeat; a `rem` height tuned to 600, which breaks when anything above it
  changes; a shell bounded everywhere, whose main region would scroll instead of
  the page; a message shrinking the participant area, which hides the room while
  something is wrong; no `rem` term, which kept the monitor's text at 28 px
  rather than 24.8 at the cost of the flat zoom band.
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
  opting every mark or the kept frame out of forced colours, when SVG needs no
  opt-out; mark names fitted to today's substring reads ("Voted, vote
  hidden"), which writes them for the tests rather than the listener; "your
  last vote" on the card, a second wording for one state.
- **J4.** lunatech.com uses burgundy for its primary button and its active
  state. As states, it would fill a room of 14 and hide the primary action.
  Ink on paper is about 17:1 for every vision type. Burgundy against ink is
  1.79 under protanopia, which is safe only because burgundy carries no state.
  Set aside: burgundy for states; the chosen card in burgundy and entries in
  ink, which gives one state two colours.
- **J5.** Showing Show while revealed re-reveals and republishes an identical
  snapshot (`RoomData.show`), so hiding it is presentation (principle 8).
  Re-voting and moving on happen about half each after a Show in the sessions
  observed, and a primary would nudge the room past a spread. Set aside: Show
  as a ghost while revealed, a look built to be thrown away; Clear as step 4's
  revealed primary, which colours the destructive button in one phase only; a
  separate step to hide Show; Next issue as the revealed primary; a primary
  chosen by the result, kept as a step 5+ candidate for the specialist.
- **J6.** Burgundy-deep on the tint over paper is 10.75 (protanopia 11.99,
  deuteranopia 10.07, tritanopia 10.75); ink on paper-pale 14.78 for all
  three. The two grounds are close in
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
  Grotesk, which the site uses only in places.
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
  disabled look. Set aside: a 4.5:1 exception for disabled cards.
- **J9.** A projector or a video tile loses a shadow and a dark page's contrast
  in a lit room.
- **Brand source.** blog.lunatech.com was considered: black and gold, its gold
  2.02 on its own light ground, so it works only as a dark page, which J9 rules
  out. A new palette was considered for accessibility and set aside, since ink
  on paper already gives the strongest contrast and J3 and J4 keep colour from
  carrying state.
- **Pass outcome.** The UI refresh design gained principle 8's definition of
  behaviour, principle 10, step 1c, step 4's hiding of Show and its wait on 1c,
  step 5 (Next issue), step 3's split into 3a and 3b, and the result-driven
  primary as a 5+ candidate. Appendix A stays the dated review it is.
- **Review.** A review with three lenses (the code, consistency, accessibility)
  brought: the contract reads; step 1c's failing cases; J3's three looks,
  facilitators apart and forced-colours marks; the offset ink focus ring; the
  simulations as a gate and a darker burgundy; the frozen deck within 7:1; J2's
  zoom bounds and the shell's `100dvh`; J5's destructive rule; the Tokens
  section; hairlines by role; L1 to L11. The revealed form waits on L3. A
  second pass (facts, consistency) brought: principle 5 reworded for J2; the
  shell bounded only where the page must not scroll; a `rem` term in the root;
  one mark per look, the mark reads a step 4 contract change; one wording for
  the kept state; one forced-colours opt-out, its ring in `CanvasText`; the
  facilitator region within principle 4; the Lines tokens.
