# UI Reference

Date: 2026-10-06
Status: In discussion (step 3 of `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`)

The design reference step 4 applies. Step 3a fills the token values, step 3b
the layouts. Decisions are provisional unless marked **(settled)**, as in the
UI refresh design's "How decisions are marked". The rules come first; the
reasons and the options set aside are in the decisions log at the end.

## Terms

- **Token**: a CSS custom property, the only place a colour, size or font is
  defined (principle 6).
- **Token list**: the named tokens step 3b may use, each with its purpose. It is
  the contract between 3a, which gives the values, and 3b, which uses them.
  "Role" is not used for this, since voter and facilitator own the word.
- **Layout cell**: one page (voter, facilitator or lobby) in one phase at one
  target screen.
- **Shared-screen elements**: the issue, the progress and the result
  (principle 5).
- **Card**: one of the deck's 13 buttons, which a voter clicks to vote.
- **Participant entry**: one person in the participant area, today a table row;
  its form is L3's.
- **Hairline**: a border that carries no state, such as a divider or a
  surface's edge.

## Mockups

- They live beside this file, under `docs/design/`, as clickable HTML.
- They show what step 4 builds and, behind a "step 5" toggle, the parts later
  steps add (progress count, Next issue, the spread), so step 4 leaves room for
  them.

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
- Every other size is in `rem`. No viewport unit appears outside the root.
- `px` only for hairlines. Borders that carry state (J3's outline and in
  between) and the focus ring are in `rem` with a pixel floor, such as
  `max(2px, 0.15rem)`, so they scale with the root and never round to nothing.

### J3. How each round state is shown

Shape for the room, words for the reader: every state differs by shape or fill
from afar, and words explain the rare ones up close.

| Participant entry | While voting | Once revealed |
| --- | --- | --- |
| No estimation | outline (waiting) | "–" in the value's place, named "no vote" |
| Confirmed | solid fill (voted) | the value |
| Unconfirmed | in between, "not confirmed" | the value, in between, "not confirmed" |
| Facilitator | no outline nor fill, "facilitator" | the same |

| Card | Shown as |
| --- | --- |
| Not chosen | plain |
| Chosen, confirmed | solid fill |
| Chosen, unconfirmed | in between, "not confirmed" in view |
| Revealed | all disabled, the phase line says why; the chosen one keeps its look |

- **Unconfirmed** is an estimation kept after a Re-vote or a restart and not
  chosen again (`voted` false, `hasEstimation` true in `room/view.ts`).
- **Solid fill** is one token, a confirmed vote, on entries and cards alike.
- **In between** sits visibly between the outline and the solid fill. Hatching
  is the first candidate; 3b compares it with a dashed outline and one other on
  screenshots shrunk to a 480 by 270 video tile, and from a few metres away.
- While voting, unconfirmed may read as waiting; once revealed it must not.
- Marking a revealed unconfirmed value is new. It shows data the view already
  has, and adds no behaviour.

### J4. Burgundy never carries a round state

- Burgundy marks the brand and a phase's one primary action, and in its deep
  shade a problem notice (J6).
- Every J3 state is drawn in ink.
- Whether links and the focus ring use burgundy is 3a's, under this rule.

### J5. The round's actions per phase

A button shows only in the phases where it does something.

| Phase | Step 4 | The Next issue step |
| --- | --- | --- |
| Voting | **Show votes** primary; Clear votes quiet | **Show votes** primary; Next issue or Clear secondary |
| Revealed | Re-vote secondary; Clear votes quiet | Re-vote and Next issue, both secondary |
| After a Re-vote | as voting | as voting |

- **Primary** is the phase's one burgundy button (J4); **secondary** an ink
  outline; **quiet** an ink button with words and an icon, never coloured.
- Step 4 hides Show while revealed, listed in its spec as a contract change,
  after step 1c has removed Show's incidental uses.
- Re-vote still shows only while revealed, a guard principle 8 carries over.
- The revealed phase has no primary. Its two actions stand as equals, in the
  workflow's order: Re-vote, then Next issue.
- Clear is the one destructive action: it discards unrevealed votes. It is
  marked by its words, its quiet look in every phase and its distance from the
  primary, never by colour or a confirmation (Appendix A, avoid 6).
- Clear stays until Next issue exists. Whether it then stays beside it is the
  Next issue step's decision.
- Step 4 places the buttons where the Next issue step needs them, so swapping
  them by phase moves nothing.
- Next issue's flow in the mockups: the editor opens empty and focused, saving
  starts the new round, cancelling changes nothing. Its step decides when the
  round clears, one request or two, and its name.
- Placements and colours stay open until the mockups, and the specialist's
  critique may move them.

### J6. Notice tones

The tone is carried by the icon and the words; the colour of the box and its
bar only reinforce them.

| Tone | For | Look |
| --- | --- | --- |
| Problem | something failed or broke: the connection lost, the session ended, a join, create or save failed | burgundy-deep text on the burgundy tint, a solid bar, an icon |
| Notice | something changed to know about: the moved link, the restart, the issue changed by someone else | ink on paper-pale, an ink bar, an icon |
| Confirmation | the user's own action done: "Link copied" | plain text beside its cause, no box |

### J7. Type, self-hosted

- DM Sans for all text, the issue included.
- JetBrains Mono for figures (cards, results, values) and the room id.
- Instrument Serif at most for the app's name in the lobby (L9).
- The app serves the fonts, not Google's CDN. 3a confirms each family's
  licence allows it.
- Step 4 keeps a late font load from shifting the page.

### J8. Contrast floor

- All text at AAA, 7:1, on every ground it sits on: help lines, labels,
  placeholders and links included. Secondary text is told by size and weight,
  or by a grey 3a computes to reach 7:1.
- Other indicators at 3:1 at least (WCAG 1.4.11).
- The focus ring meets WCAG 2.2's AAA focus appearance: at least 2 px, and 3:1
  against what surrounds it.
- The frozen deck keeps its text at 4.5:1 at least: it looks disabled by its
  shape and the phase line, not by fading.
- 3a's script checks each pair at its floor, with colour-blind simulations
  (Machado 2009, full severity).

### J9. Motion, surfaces and shapes

- **Motion**: only small transitions, such as entries turning on a reveal and a
  button changing state, each at most 200 ms, and none under
  `prefers-reduced-motion`. Motion never carries information alone.
- **Surfaces**: the page on paper, content surfaces on paper-warm or white
  (3a's choice), told apart by a hairline, not a shadow.
- **No dark sections**: one light theme (principle 6).
- **Shapes**: lunatech.com's corner radius and border widths, measured in 3a,
  within J8's 3:1 for indicators.

## Open

- **L6. The room page's header.** The app's name may leave it: no case reads it,
  the tab title carries it, and the 600 px budget wants the room. Its `<h2>` is
  today the page's only heading, so L6 also gives the page a heading structure,
  such as the room id or the issue as its main heading.
- **L11. Width breakpoint** between the narrow and the wide layout. It sits
  clear of common window widths, such as 1280, rather than on them.

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
  case. Zoom stays effective: with `clamp(0.875rem, 1.25vmin + 0.5rem, 1.75rem)`,
  200% zoom on the target gives 1.8 times the text, 300% gives 2.7, because the
  minimum takes over. Browser zoom scales `px` too; what `px` misses is the
  fluid root, which would thin state borders on a big shared screen. Hairlines
  stay in `px` because borders round to whole device pixels, and a thin `rem`
  border renders unevenly. Set aside: fluid sizes on the shared-screen elements
  only, which left their spacing fixed; pure `vmin`, which ignores zoom; `rem`
  steps per media query, which jump.
- **J3.** Voted against waiting is what the room watches, so it needs a fill or
  a shape read from afar; the rare states need words. A dashed outline against
  a solid one was judged too weak from afar, hence an in-between level compared
  on the mockup. Set aside: words on every state, which repeat the shapes and
  cost width on 14 entries; icons with words, which Appendix A's improve 4
  retires; a cross for "no vote", which reads as refused; a card back, which
  already means hidden.
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
- **J6.** Burgundy-deep on the tint is 10.75 (protanopia 11.99, deuteranopia
  10.07); ink on paper-pale 14.78 for all three. The two grounds are close in
  lightness, hence the icon and words. Set aside: four hues, which bring colours
  from outside the brand, red-green confusion and an amber that rarely reaches
  AAA, to split moved from restarted, which nobody acts on differently; ink
  only, which drops the red cue and is as loud as anything on the page.
- **J7.** JetBrains Mono's figures are tabular and tell look-alikes apart.
  Instrument Serif has one light weight with thin hairlines, which a lit
  projector and video compression eat. Self-hosting keeps visitors' addresses
  from Google, survives a proxy that blocks the CDN, and drops an outside
  dependency. Set aside: the serif for the issue; system fonts only.
- **J8.** Principle 10 asks for it, and the brand's ink and paper make it cheap;
  only the muted grey needs replacing. Set aside: AA beyond the shared-screen
  elements, which allows the site's grey but falls short of principle 10; 7:1
  for every indicator, which makes each border heavy for no reading gain.
- **J9.** A projector or a video tile loses a shadow and a dark page's contrast
  in a lit room.
- **Brand source.** blog.lunatech.com was considered: black and gold, its gold
  2.02 on its own light ground, so it works only as a dark page, which J9 rules
  out. A new palette was considered for accessibility and set aside, since ink
  on paper already gives the strongest contrast and J3 and J4 keep colour from
  carrying state.
- **Pass outcome.** The UI refresh design gained principle 8's definition of
  behaviour, principle 10, step 1c, step 5 (Next issue), and the result-driven
  primary as a 5+ candidate. Appendix A stays the dated review it is.
