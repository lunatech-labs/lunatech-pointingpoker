# UI Refresh

Date: 2026-09-30
Status: In discussion
Supersedes: step 8c of `docs/superpowers/specs/2026-09-24-frontend-rewrite-design.md`

## Purpose

The page still carries the visuals and interactions of the proof of concept it
started as, on Lunatech branding at least five years old. The backend protocol
and the frontend stack have been modernized over some twenty merges, and users
have seen none of it. This design brings the page to a modern standard, for
four reasons in no priority order: Lunatech's current visual identity, better
UI and UX, use on narrow screens and phones, and quality-of-life features. It
is the first visible change after the foundation work, and the gate to what
comes next.

It replaces step 8c, which grew past one step. It is its own design rather
than step 9 of the protocol architecture, whose path was about the protocol and
the stack; step 9 keeps its number and its scope.

## How decisions are marked

The direction is expected to move as mockups and a UI/UX specialist's critique
arrive, so the plan's text is provisional unless marked **(settled)**:

- **Settled**: reopened only with a stated reason.
- **Unmarked**: expected to move; changing it needs no justification beyond
  the new information.

A step's own section is its spec: decided, unmarked, and frozen when that step
is delivered, as delivered specs do elsewhere in this repo. The
document as a whole stays in discussion.

## Terms

- **Voter**: a participant who votes and counts toward "everyone has voted".
- **Facilitator**: a participant who does not vote, typically the product owner
  sharing the page with the room. Step 9 of the protocol architecture already
  says "facilitator" loosely for whoever records a round's value. Both words are
  settled in step 2's spec, `2026-10-04-ui-refresh-2-roles-design.md`, "Terms".
- **Progress**: who has voted and who is still waiting, however step 3 shows
  it, as a summary line or a participant area that fits, kept in view as
  principle 4 requires.
- **Test contract**: defined in step 1, under "The test contract"; steps 1a,
  1b, 2c, 4 and 4a each add to it in their own sections.
- **Live region**: an element the browser watches, so text added or changed
  inside it is spoken without its user moving there.

## Principles

1. **Brand source** (settled). lunatech.com is the only reference, since the
   company has no written design system. Step 3 extracts palette, type and
   shapes from it.
2. **Target screens, in priority order**:
   1. A laptop screen, about 1280 to 1440 by 700 CSS px of viewport at 100%
      zoom. This is the design target for principle 4. A 1366 by 768 laptop,
      or 1920 by 1080 at 150% scaling, leaves nearer 600; step 3 settles
      which height the target is.
   2. A desktop monitor: the same layout at a capped width, not stretched.
   3. The facilitator's shared screen, legible on a meeting-room TV of 40 to 60
      inches, a projector in a lit room, and a compressed video-call tile.
   4. Narrow windows and phones, including a laptop split between the call and
      the page. The floor is that nothing breaks.
3. **Mobile-first CSS** (settled), as a method. Base styles target the narrow
   layout and `min-width` media queries add the wider ones. It costs little in a
   rewrite and it is what keeps a zoomed page usable (principle 5). Checks on a
   real phone happen on the deployed app only and never gate a merge; phone
   risks go to `docs/known-issues.md`.
4. **Degrade gradually with room size** (settled). At 100% zoom on the laptop
   target, a monitor or the shared screen, the page as a whole never scrolls;
   the narrow layout, phones and a zoomed page included, may scroll vertically,
   never horizontally. A notice that ends may push the room down and let the
   page scroll vertically while it shows: a banner reporting a rare event, such
   as the connection lost, a moved link or a restart, until it clears or is
   dismissed; and a failure or a conflict, such as a failed save, join or
   create, or the issue changed by someone else while the user edits it, until
   the user resolves it or ends the action it belongs to. Left unresolved, such
   a notice is an unfinished action, and the degraded layout is accepted.
   Routine confirmation of the user's own action, today only the "Link copied"
   hint, shows beside its cause and moves nothing. A zoomed shared screen still
   keeps the issue, the progress and the result in view without scrolling; the
   facilitator's page has no deck, so it has room to. As the room grows, only
   the participant area and the results grow. The participant area, past a size,
   scrolls in its own region, and any line that names people summarizes
   ("waiting: Bob, Eve and 3 more"). The results are bounded by the deck's 13
   values for votes cast from the page; the server accepts any value
   (`docs/known-issues.md`, "No request payload is validated on any endpoint
   that takes one"). Step 3 decides whether they scroll or summarize. Nothing
   else on the page moves because of the room's size. The thresholds belong to
   step 3 and are not settled: Appendix A's room sizes, 4 to 14 with 12 a
   regular upper bound, are informative, to be weighed against the design rather
   than imposed on it. A design excellent up to 8 and degrading gently past it
   can beat one that holds 12 unchanged. Whatever the thresholds, rooms of 4 to
   14 stay usable.
5. **Shared-screen legibility** (settled), its numbers not:
   - The issue, the progress and the result are sized relative to the viewport,
     so they read from the back of a room on a 40 inch TV.
   - Their text meets WCAG AAA contrast (7:1), since a lit projector and video
     compression both eat contrast.
   - No state is carried by a pale tint or a thin line alone. Voted, waiting,
     unconfirmed and revealed differ by text, shape or a solid fill.
   - Browser zoom is the facilitator's own lever: at 200% a 1280 px laptop is a
     640 px layout, so the narrow layout must serve it (principle 4).
6. **One brand theme**. No light and dark switch, matching lunatech.com.
   Colours exist only as CSS custom properties, so a second theme stays
   possible without touching components.
7. **Two audiences** (settled). Voters get the deck. Facilitators get no deck,
   and their page is what the room sees. Controls stay open to everyone, and
   there is no control-less observer mode.
8. **Logic stays out of markup** (settled). State and protocol logic lives
   under `room/` and `protocol/` and in the `use*` hooks; step 4, a restyle,
   changes none of it. Behaviour is what a user can do and what the room sees
   as a result; which controls show is presentation, unless the control is a
   guard, as Re-vote's hiding is. Behaviour components still hold is carried over
   unchanged. The e2e cases guard most of it; these are, notably, the parts a
   restyle breaks most easily, several with no case:
   - `IssueEditor.tsx`: the Enter guard during input-method composition, focus
     taken back after a failed save unless the user has moved elsewhere,
     `flushSync` so a phone shows its keyboard, and the refocus in
     `takeTheirs`.
   - `Deck.tsx`: the cards disabled while revealed.
   - `App.tsx`: the join, create and leave flow, the name and room in
     `localStorage`, the trimmed room id, reading and stripping `?moved=1` and
     `?restarted=1`, and the "Link copied" hint's 2 s timeout, started on each
     copy and not reset by the next.
   - The copy hint, wherever it lives, today in `Alerts.tsx`: rendered only
     while shown, as a `role="alert"`, so it is announced wherever step 4 moves
     it.
   - `Room.tsx`: the revealed-round vote guard and the refusal routing,
     including `saveIssue`'s rethrow, which is what makes the editor show a
     failure.
   - `Controls.tsx`: Re-vote shown only while revealed. The server's re-vote
     has no guard, so one click during voting unconfirms every vote.
   - `Lobby.tsx`: Enter submits on keyUp from the name field only, and a fixed
     room hides the tabs and makes the room id read-only.
   - `RoomHeader.tsx`: copying the link.
9. **The suite reads only the test contract** (settled), so a restyle is judged
   by the suite staying unchanged. A step that changes the contract lists each
   change as a decision in its own spec.
10. **Accessibility first**. Low-vision and screen-reader users are served as
    fully as anyone, as a mark of the product and of the company:
    - All text at AAA contrast (7:1), other indicators at 3:1, and WCAG 2.2's
      AAA focus appearance, checked with colour-blind simulations.
    - No state by colour alone (principle 5), so the page survives
      `forced-colors`, Windows' high-contrast mode.
    - Live regions announce what changes (steps 1a and 4a), browser zoom stays
      effective (principle 5), and motion stops under `prefers-reduced-motion`.

    The numbers are J8's in `docs/design/ui-reference.md`.

## Steps

| # | Step | Waits on | Judged by |
| --- | --- | --- | --- |
| 1 | Test contract and accessibility | nothing | Tests, and an unchanged look |
| 1a | The editor's live region | 1 | Its case, and an unchanged look |
| 1b | Alphabetical participants | 1a | Unit tests and one order case |
| 2a | Seats, no behaviour change | 1 | The existing cases unchanged, and new unit cases |
| 2b | Roles on the server and the wire | 2a | Unit and API tests, and the existing cases unchanged |
| 2c | Roles in the page | 2b | Its cases |
| 3 | Design direction (no code) | nothing | The product owner, then the specialist |
| 1c | Test contract audit | 3 | Every case passing on today's page, each rewritten one shown to fail |
| 4 | Restyle | 1b, 1c, 2c, 3 | By eye, and the existing cases unchanged |
| 4a | The round's live region | 4 | Its cases |
| 5 | Next issue | 4 | Its cases |
| 5+ | One step per feature | 4 | Each one's spec |

**Order**: 1, 1a and 1b stacked and merged in the same window, then 2a, 2b and
2c likewise, then 1c, 4 and 4a stacked, while 3 runs alongside from now, and 5
after 4.
The mockups are the critical path to a visible change, and step 2 is built
while they are drawn, so putting roles before the restyle costs the new look
little or no time. The specialist's critique does not gate step 4: step 3's
output is a design reference reviewed by the product owner, and the critique
feeds later polish steps, which the custom properties keep cheap. Reopen this if
the mockups turn out quick and step 2 slow, since users having seen no change
after the rework is the pressure behind it.

**Step 1. Test contract and accessibility.** Specified below.

**Step 1a. The editor's live region.** Specified below. Announcing changes to
a screen reader is a behaviour of its own, with its own decisions and its own
ways to fail.

**Step 1b. Alphabetical participants.** Specified below. It is a behaviour
change judged by its own tests, and keeping it out of step 1 keeps that step's
unchanged look literally true.

**Step 1c. Test contract audit.** Each case keeps the behaviour it guards and
loses the elements it reaches it through by chance, so step 4 and step 5 can
change which controls show. Known so far: Show votes as the fixed point of the
reveal's layout-shift case, and as the sign a join succeeded in `fixtures.js`
and the lobby cases, where Leave or the role line serve in every phase and
role. Its list is completed from step 3's layouts, hence its place after 3.

**Step 2. Roles: voter and facilitator.** Product owners who facilitate and
never vote keep the round from completing, so auto-reveal never fires
(Appendix A, "How sessions run"), and a "4 of 6 voted" count would never reach
its total either. Step 2 adds a role per
participant to the snapshot, excludes facilitators from the completion rule, and
lets a participant choose and switch role; a facilitator's page has no deck. It
is built in today's look and restyled in step 4. Specified in its own document,
`docs/superpowers/specs/2026-10-04-ui-refresh-2-roles-design.md`, as steps 2a,
2b and 2c: seats without a behaviour change, roles on the server and the wire,
then roles in the page.

**Step 3. Design direction.** Mockups of the voter's and the facilitator's
pages, before and after a reveal, at the screens in principle 2, and the lobby.
They can be clickable HTML built from lunatech.com's palette and type. The
output is a short design reference committed to the repo: palette as custom
properties, type scale, spacing, component looks, and the layouts. Appendix A is
its starting input. It runs as 3a, the tokens, then 3b, the layouts, and its
reference is `docs/design/ui-reference.md`. After a reveal the deck stays on
the page, disabled, at every width, as the suite's "takes no more votes" case expects; the result
appears near it, not in its place. The layouts include a phase line: text
visible in both phases, saying whether voting is open or the round is revealed,
outside the deck so the facilitator's page keeps it, and directly above or
beside the deck's first row, read just before it, and in view whenever that row
is centred in the viewport, so a voter looking at the deck sees why it is
frozen. Its place and its height change with neither the phase, the votes nor
the room's size, at every width. Its revealed text contains "The round is
revealed", which appears once on the page, and its open text does not, ignoring
case, so `frozenNotice` reads it unchanged. It may share a line with the
progress, as a separate element (Appendix B). Step 4a makes it the round's live
region, and the disabled deck needs no description of its own, since the line
says why.

**Step 4. Restyle.** The step 3 reference applied, the CSS library chosen,
Bootstrap 4 and its Dependabot major-version pin removed, mobile-first layout,
and the result placed so a reveal no longer pushes the participants down, which
closes that entry in `docs/known-issues.md`, and the "Link copied" hint moved
beside the "Copy link" link (principle 4; Appendix A, improve 10), and Show votes
hidden while revealed, where it does nothing (the reference's J5). It keeps the
interactions steps 1 to 2 leave. Its spec gives each of these guarantees a
browser case that fails against a layout breaking it, with the viewports and
element lists step 3's layouts give:

- At the laptop target, in each phase, with a room of 14, as many distinct
  values once revealed as step 3's layouts allow, and no notice shown, the page
  does not scroll and each element step 3's layouts list, the phase line among
  them, is wholly in view.
- The elements that do not grow keep their place between a room of 2 and a room
  of 14.
- The facilitator's page, zoomed to 150% and 200% at least, keeps the issue in
  view, and in each phase its progress or its result.
- The phase line keeps its place and its height through a reveal, a reopening
  and a vote, and on the voter's page sits by the deck's first row (step 3).
- The copy hint moves nothing and covers nothing.
- No page scrolls horizontally at 320 CSS px, including with a long unbroken
  name, an issue that wraps, and the banners shown.

Principle 8's Re-vote and copy-hint timing are guarded from step 1. The progress
and the phase line get test ids, the moved copy hint becomes a
`role="status"` region, and Show votes is absent while revealed, all listed as
contract changes (principle 9).
Two options for its spec to weigh. A CSS reset: `bootstrap.min.css` brings
Reboot, Bootstrap's reset, so removing Bootstrap removes it too, and the
chosen library may or may not ship one. The deck as a `<fieldset>` with a
`<legend>`: the same `group` role and name step 1 gives its `div`, so no case
changes, and `<fieldset disabled>` freezes every card at once. Step 1 keeps
the `div` for the look (its "Considered and not taken"). Without Bootstrap, a
reset must clear the fieldset's defaults, and the legend still needs a visually
hidden style.
Appendix C holds what this design's reviews found about writing these cases.

**Step 4a. The round's live region.** Announces a reveal and a reopened round,
by making step 3's phase line a live region. Today's reveal row cannot be one:
it is hidden with `visibility` while the round is open, and an announcement
needs text that changes in place. A visually hidden copy beside it was step
1a's first design, and nearly every review finding on it came from the copy,
so this waits for a visible line instead. It follows step 4 because a restyle
adds no behaviour. Its spec starts from Appendix B.

**Step 5. Next issue.** One action for Clear, then edit the issue (Appendix A,
improve 7), and the round's actions per phase it makes possible: the target
column of the reference's J5. Its spec decides when the round clears, one
request or two, its name, and whether Clear stays.

**Steps 5 and after.** One step per feature, each with its own short spec,
picked from these candidates and whatever the mockups raise. None is a
commitment:

- A progress count, "4 of 6 voted, waiting: Bob, Eve", which needs step 2's
  denominator (Appendix A, improve 3).
- The revealed phase's primary chosen by the result: Next issue when the votes
  agree, Re-vote when they spread, if the specialist's critique supports it.
- Results that show the spread and the lowest and highest voters (improve 5).
- A pasted ticket link made clickable in the issue (improve 8).
- "Not Alice?", joining under another name than the remembered one.
- Names checked at join: today an empty or blank name joins as a blank row,
  which nobody can refer to. To decide: trimming at join, a remembered empty
  name, and a maximum length. The server-side check belongs with
  `docs/known-issues.md`, "No request payload is validated on any endpoint that
  takes one". Duplicate names stay allowed. Refusing them would lock out someone
  whose laptop died and who rejoins from a phone without the cookie: their old
  row holds the name until its grace period ends, often the last votes of the
  meeting.
- A notice to whoever shares a name with another row: "Another Alice is in the
  room", near the user's own name. It is derived from each snapshot, comparing
  names trimmed and at base sensitivity without `numeric` (ignoring case and
  accents, but "Dev 02" and "Dev 2" differ), so it needs no state and clears
  itself when the other row leaves. A `#1`, `#2` suffix was rejected: it tells
  the room the rows differ but not who is who, needs a join order the snapshot
  does not carry, and outlives the row it was told apart from.
- Renaming oneself during the meeting, a new server command that rebroadcasts
  the snapshot. It lets two people sharing a name tell themselves apart, and
  also fixes a typo or a blank name. Close to "Not Alice?", which changes the
  name before joining rather than after.
- Keyboard shortcuts for voting.
- Known rooms in the lobby's Join form: completion from the `role:<id>` keys,
  which exist only for rooms the page reached (step 2c), showing each room's
  last role, so a known room is picked rather than typed. To decide: ordering,
  how many, removal (only Create removes a key, so a link to a reused slug
  finds an old one), and how the role is shown.
- Announce a recovered connection: a screen reader hears the connection lost
  but not its return (`docs/known-issues.md`, "A screen reader hears the
  connection lost, but never that it came back").

## Where step 8c's list went

| Step 8c item | Now |
| --- | --- |
| Alphabetical participant order | Step 1b |
| The revealed-round live region | Step 4a, on step 3's phase line |
| The editor's live regions | Step 1a |
| Role-based e2e selectors | Step 1, as the test contract |
| Component library and look | Step 4, from step 3's reference |
| Responsive layout | Step 4 |
| Restyling the editor | Step 4 |
| Participants above the results | Step 4, as "the result placed so a reveal no longer pushes the participants down" |
| "Not Alice?" | A step 5+ candidate |
| Light and dark theme | Dropped: lunatech.com has one theme |
| Frozen-deck tooltip | Dropped (settled): hover does not exist on a phone, and the visible "The round is revealed" sentence already says why the deck is frozen |

## Relation to other documents

- The frontend rewrite spec's step 8c is superseded here; its 8c text is left as
  written. The status line and the pointers in the roadmap, the protocol
  architecture, `docs/known-issues.md` and `.github/dependabot.yml` land with
  this document. The roadmap's TV mode item is marked addressed rather than
  covered, since the facilitator's page keeps its controls.
- Step 9 of the protocol architecture is unchanged and independent of this
  design. Running it after step 4 lets its UI be built once, in the new look.

## Branches

`20260930.ui_refresh_<step>_<name>`, dated by this design and numbered by its
steps. This document lands with step 1 rather than in a docs-only merge, since
every merge to main restarts the server.

## Step 1. Test contract and accessibility

Status: landed. Branch: `20260930.ui_refresh_1_test_contract`.

### Scope

The e2e suite moves off class names, tags and table structure onto the test
contract, and the page gains the accessible names that contract reads. Nothing
looks different. The live regions are steps 1a's and 4a's.

**Pass condition.**

- The suite is green, with every selector change listed in the PR with its
  reason.
- No class, tag or structure selector is left under `e2e/`. The PR quotes two
  greps: one for `locator(`, `$eval`, `$$eval`, `querySelector` and `closest(`,
  whose every remaining hit is a role or test-id attribute selector, and one
  for the structural roles `'table'`, `'rowgroup'`, `'row'`, `'columnheader'`
  and `'cell'`, which finds nothing.
- The look is unchanged, checked side by side with a throwaway Playwright
  screenshot script, not committed, run on main and on the branch at the default
  viewport and at 390 by 844, the phone size `slug.spec.js` uses, in four
  states: the lobby, a room before a reveal, after a reveal, and during a
  re-vote.
- Every attribute step 1 adds is shown to bite. On the branch tip, each one is
  removed in turn and the PR records which case fails. Three exceptions: for the
  issue box the placeholder is removed instead, and the case must still pass,
  which shows the `aria-label` carries the name; for the icons `aria-label` is
  the one removed, since Playwright already treats an `svg` as an image and
  lucide-react hides an icon only while it has no `role`, `aria-*` or `title`
  prop and no children; and the unconfirmed note's `hidden` is shown by the
  re-vote screenshot in the markup commit, since no locator reads it, and the
  frontend is unchanged after that commit.

### The test contract

The test contract is what the suite may read: roles, accessible names, text
and `data-testid`s, never classes, tags or page structure. Controls and states
are read by role and name. A container whose shape step 4 will change is a
named region or group, and each entry inside it, each field without a text
label of its own, and each state no role or name can express carries a
`data-testid`. A live region carries a test id rather than a name, since naming
it can change what screen readers announce. Everything else inside an entry is
read by its text.

The table lists what step 1 changes or adds; reads already by role, name or
text, such as the Join, Leave and Rejoin controls, a card by
`getByRole('button', { name, exact: true })`, the reveal notice's sentence,
or "Could not save the issue", stay as they are.

| What the suite reads | Contract | Today |
| --- | --- | --- |
| Name input, lobby | `getByLabel('User name')`, from a `<label htmlFor>` | `.form-group.row` filtered by text |
| Room id input | `getByLabel('Room id')`, which the existing label already gives | `#join-roomId` |
| Issue box | `getByRole('textbox', { name: 'Current issue' })`, from an `aria-label`, which outlives the placeholder step 4 may drop | `getByPlaceholder` |
| The cards | `getByRole('group', { name: 'Estimation cards' })`, then its buttons, which the "banner covers no card" case first counts as 13 so it cannot pass on none | `$$eval('.estimation-button')` in `slug.spec.js` |
| Own estimation, the selected card | `getByRole('button', { pressed: true })` inside the Estimation cards group, only while the vote is confirmed; every other card carries an explicit `aria-pressed="false"` | `.estimation-button-selected`, and `.estimation-card .estimation-text` for `ownEstimation` |
| Unconfirmed after a Re-vote | the card is not pressed, and has the accessible description "Previous vote, not confirmed", from a `hidden` element outside the button, rendered only in that state, and the card carries `aria-describedby` pointing at it; read as `getByRole('button', { description: 'Previous vote, not confirmed' })` | `.estimation-button-uncomfirmed` |
| Participants | `getByRole('region', { name: 'Participants' })`, entries `getByTestId('participant')` | table filtered by the "Voted" header, `tbody tr` |
| A participant's voted mark | `getByRole('img', { name: 'Voted' })`, from `role="img"` and `aria-label` on the icon | first `td`'s `svg, i` |
| A participant's hidden vote | `getByRole('img', { name: 'Vote hidden' })`, likewise | third `td`'s `svg, i` |
| A participant's revealed value | `getByTestId('participant-estimation')`, rendered only while revealed | third `td`'s `div` |
| Results | `getByRole('region', { name: 'Results' })`, entries `getByTestId('tally-entry')` with fields `tally-value` and `tally-count` | table filtered by the "Number of votes" header, `tbody tr` and `td` |
| Most voted estimation | `getByTestId('most-voted')` on the value element inside Results | `.summary-card .estimation-text` in `session.spec.js` |

These deserve their reason:

- The own estimation is read from the pressed card, not the large "Your
  estimation" card. Every assertion on it means "my card is this one", and
  Appendix A proposes removing the large card, which would otherwise force a
  contract change in step 4.
- The revealed value keeps a test id because it is the one signal a reveal
  landed where nobody voted, whose value is empty; `revealedEstimation`
  relies on it.
- An unconfirmed card is not pressed. After a Re-vote the page drops the
  selected styling today, the vote is not cast, and pressing the card casts
  it, so "pressed" would misinform a screen reader. It also keeps the re-vote
  case's "nothing selected" meaning as it is.
- The unconfirmed card is read by its description, which `getByRole` filters on,
  so the note needs no test id. The migrated re-vote case finds no card so
  described while the vote is confirmed, one reading "5" after the Re-vote, and
  none after Clear, keeping today's check of which card it is; the first is new,
  and shows the note is rendered only in that state. The note is `hidden`, which
  keeps it out of the card's name and keeps a screen reader from reading it
  again as loose text; `aria-describedby` still takes a hidden element's text.
- An explicit `aria-pressed="false"` is checked with `toHaveAttribute`: the
  role filter `pressed: false` also matches a button with no attribute at all.
- `expectSummaryMatchesTable`'s guard against a third column is dropped: an
  entry's fields are named by test id, so a new field is a contract change
  anyway.

Considered and not taken:

- A `radiogroup` for the deck. Choosing one card of thirteen is radio
  semantics, but radios bring arrow-key navigation and a roving tab stop that
  belong with the step 5+ candidate "Keyboard shortcuts for voting".
  `aria-pressed` says "selected"
  without them, at the cost that pressing the selected card again does not
  unpress it.
- `aria-description` for the unconfirmed card, which needs no extra element but
  is still an ARIA 1.3 draft.
- `aria-pressed="mixed"` for the unconfirmed card: to a screen reader it means
  partly pressed, which misdescribes the state.
- The deck as a `<fieldset>` with a `<legend>`. Reboot already clears a
  fieldset's border, padding and min-width, but the `<legend>` would show as a
  1.5rem heading unless a class hides it, so step 1 keeps the `div`; step 4
  weighs it again.

### Commits

1. `docs`: this design, and the pointers listed under "Relation to other
   documents".
2. `feat(frontend)`: the markup. Labels, the issue box's name, the named deck,
   `aria-pressed` and the unconfirmed note, named icons, the Participants and
   Results regions with their test ids, and `most-voted`. The existing suite is
   untouched and still green, which shows the markup alone changes nothing it
   checks.
3. `refactor(e2e)`: the helpers, comments and titles that name a row, a table,
   a cell or an icon are renamed for what they find; `summaryTable` is left to
   commit 4, whose selectors change its meaning. Judged by the suite staying
   green unchanged, so commit 4's diff holds only the selector changes.
4. `test(e2e)`: the existing suite moves onto the contract, in `e2e/fixtures.js`
   and in the spec files' inline selectors, and `fixtures.js` loses its "Step 8
   revisits selectors" comment; the "banner covers no card" case gains its
   count of 13, and the re-vote case its check while the vote is confirmed,
   which also reads `aria-pressed="false"` on a card other than the pressed one
   with `toHaveAttribute`; that check is shown failing against a note that
   ignores confirmation. No product code changes; judged by step 1's pass
   condition.
5. `test(e2e)`: two cases for principle 8, behaviour a restyle breaks easily.
   Re-vote is absent before a reveal and after a Clear. The copy hint shows
   right after a second copy at 1.5 s and still at 1.99 s, and is gone at 2 s,
   which catches both a timer reset on each copy and an early clear. The PR
   shows each failing against a mutation: Re-vote always rendered, Re-vote
   kept once a round was revealed, the timer reset on each copy, and an early
   clear. No product code changes.
   - The hint is found by its text, not by `getByRole('alert')`, so step 4's
     move to a `status` region adds a lookup and breaks none.
   - `page.clock.install` alone lets time run on; pause it with `pauseAt`
     before copying, or the 2 s timer can fire mid-check.
   - The fixture joins before the clock is installed, so `connection.ts`'s
     tick stays a real interval. Pause a few seconds after the real time, not
     at a fixed date: the tick compares the paused `Date.now` with a heartbeat
     heard on the real clock, and a gap of `STALE_MS` reconnects and shows the
     lost banner mid-check.
6. `docs`: this step's status line, as the PR's last commit before merge.

### Accepted costs

- A test id is a handle, not accessibility; the suite still reads each entry's
  text, so a restyle cannot drop what an entry shows unnoticed.
- "User name" and `most-voted` are likely to change with Appendix A's improve
  items 9 and 5; whichever step does it lists the change, per principle 9.
- `role="img"` on the icons is kept for screen readers, but nothing in the
  suite guards it.
- Nothing reads the large "Your estimation" card any more, so a wrong value
  there goes unnoticed for as long as the card stays (Appendix A proposes
  removing it).

## Step 1a. The editor's live region

Status: landed. Branch: `20260930.ui_refresh_1a_editor_live_region`, stacked
on step 1.

### Scope

This step adds a live region, so a screen reader user hears the issue
editor's notices. Nothing looks different.

**Pass condition.**

- The suite is green.
- The look is unchanged, checked as in step 1 at the same two viewports, against
  step 1's branch, with two more states: the conflict notice and "Could not save
  the issue".
- The new case is shown failing against step 1's product code, and against
  three variants: one with the test id but no role, one with
  `aria-live="off"`, and one that re-creates the region through `key={text}`.
  The region helper is also run by hand against `aria-atomic="false"` and an
  ancestor with `aria-busy="true"`, recorded in the PR's bite table.
- A screen reader check by hand, not a merge gate: Orca with Firefox or
  Chromium, through the conflict notice, a failed save by mouse and by Enter
  (`/edit-issue` blocked in DevTools), a retry, and "Use theirs" while both
  notices show. The PR names the browser. Commit 2 updates the mouse-save
  accepted cost with what was heard; anything else this section does not promise
  goes to `docs/known-issues.md`.

### The region

One always-rendered, unstyled and not visually hidden `issue-status` region
below the issue box, with `role="status"`, holds the conflict notice and the
"Could not save the issue" line while the editor's `notice` or `failed` is set.
It adds no state: it renders from those two. Empty, it has no height, so the
page does not move; the notices push the page down while shown, as today
(principle 4).

- It is the same element for the room's life, rendered by `IssueEditor`, which
  the room always mounts: a screen reader announces later changes to a region's
  text, and text already there when an element appears is not announced.
- It is not `role="alert"`, which is assertive and cuts off whatever the screen
  reader is saying. The conflict notice arrives while the user types, and can
  come back on a keystroke, so an alert would cut off their keystroke echo; the
  failure line answers the user's own save, which a polite region reads at once.
  `movedBanner` and `restartNotice` filter `getByRole('status')` by their own
  text, so the new region does not affect them.
- It sits in the page's flow above the deck, so the "banner covers no card"
  case in `slug.spec.js`, which hit-tests every card for any `status` element,
  never finds it over a card.

The region announces a notice when it appears, again when its text changes
while shown, and is silent when the last notice goes, whether the user acted or
the room's issue caught up. The conflict notice's announcement should include its
"Use theirs" button (not in Orca with Firefox, the only pair checked; see
`docs/known-issues.md`).
`role="status"` implies `aria-atomic="true"`, so the region is read whole: while
both notices show, a change to either reads both. One going is a removal, which
`status` does not announce (but see Accepted costs).

### The contract

| What the suite reads | Contract | Today |
| --- | --- | --- |
| The editor's notices, announced | `page.getByRole('status').and(page.getByTestId('issue-status'))` | new; the existing text lookups stay page-wide and unchanged |

- The region is found by role and test id together. A role lookup skips
  anything a screen reader cannot reach (`aria-hidden`, `display:none`,
  `visibility:hidden`), so one locator checks the role, that the region is
  reachable, and its text. A test id alone would pass with the role missing or
  the region hidden.
- The region helper, in `e2e/fixtures.js`, guards the announcement itself. It
  marks the region in the browser before a change
  (`region.evaluate(el => (el.__probe = 1))`) and asserts the mark is still
  there after it. React leaves such properties alone, so the mark is lost only
  if the element was re-created, which a restyle could do unnoticed. Step 4a
  reuses the helper.
- The region helper also checks the region is not silenced: `aria-live`,
  `aria-atomic`, `aria-relevant` and `aria-busy` are each absent or equal to
  their value under `status` (`polite`, `true`, `additions text`, `false`),
  trimmed and lowercased, `aria-relevant` as a token set; and no ancestor has
  `aria-busy="true"`. No browser exposes what is spoken; that is the hand
  check's part.
- The suite checks the region with `toBeAttached`, `toBeEmpty` and
  `toHaveText`, never visibility, which an empty region lacks (The region).

### Commits

1. `feat(frontend)`: the region, and the region helper. Case, in
   `room.spec.js`: the region is empty, then holds each notice in turn, in the
   same element throughout.
2. `docs`: this step's status line, and the mouse-save accepted cost updated
   from the hand check, as the PR's last commit before merge.

### Accepted costs

- The region is announced again on each failed retry: saving clears both
  notices, and a failure brings back the line, with the conflict notice if it
  still applies.
- The conflict notice can be announced again mid-typing: it goes while the draft
  equals the other user's text, and comes back on the next keystroke, moving the
  page up and back.
- With both notices shown, some screen readers reread the remaining one when
  the other goes, since the region is atomic.
- A failed save by mouse on the Save issue button goes unheard in Orca with
  Firefox, and Space or Enter on the button is expected to behave the same: Save
  is disabled while saving, so the editor moves focus back to the box, and
  reading the box cuts off the polite line. The line stays on screen, and Enter in the box keeps focus. See
  `docs/known-issues.md`.
- Until step 4a, a reveal and a reopened round are not announced, as today.

## Step 1b. Alphabetical participants

Status: landed. Branch: `20260930.ui_refresh_1b_alphabetical_order`, stacked
on step 1a.

### Scope

This step lists participants in name order. Nothing else changes, the results
table included.

**Pass condition.**

- The suite is green.
- The unit cases, fed deliberately mis-ordered input, are shown failing against
  step 1a.
- Each rule's case is also shown failing against the sort without that rule:
  no trim, plain `<` in place of the collator, no `numeric`, and no tie-break.
- The e2e case is a regression guard only: ids are random UUIDs, so step 1a's
  order is alphabetical in one run of twenty-four.

### The order

`view.ts` sorts the participants it returns by their trimmed name with `new
Intl.Collator('en', { numeric: true })`, and breaks ties by user id, compared by
code unit (`a.id < b.id`). The base letter decides first, so case and accents
order only names that are otherwise equal, "alice" before "Alice", and "Dev 2"
comes before "Dev 10". Trimming applies to the sort only: the name shows as
typed, and a blank name sorts first. The locale is pinned: without one each
browser collates by its own, Swedish putting "Ä" after "Z" for example, and the
screen-sharer's order would differ from everyone else's. This replaces the
frontend rewrite spec's unpinned `localeCompare` at base sensitivity; its
reasons for name order carry over. Ordering by revealed value is left to the
step 5+ candidate "Results that show the spread and the lowest and highest
voters".

The tie-break is explicit rather than left to the snapshot's UUID order and a
stable sort: that order is not a guarantee of the snapshot, and a change to it
would order equal names differently on different screens with no test noticing.

The tally keeps reading the snapshot's order, and only the list
`Participants.tsx` renders is sorted. Sorting before the tally would move a tie
between two values that are not integer-like, `0.5` and `?` today, from id order
to name order, which is no less arbitrary. The tie rule stays with
`docs/known-issues.md`, "A tied vote is broken by JavaScript key order".

Sorting on the server, as a guaranteed order in the snapshot, was considered
and not taken. The order is a view: it may differ by phase or page, and each
such change would become a protocol change. All clients run the same `view.ts`,
so a pinned collator gives one order without the server, and the JVM's collator
would differ from the browsers' anyway.

### The contract

| What the suite reads | Contract | Today |
| --- | --- | --- |
| Participant order | `participantEntries(page)` read with `toHaveText([...])`, in name order | new; entries are read one at a time, by name |

This widens step 1's definition by one exception: the order of participant
entries, and no other order, is part of the contract (principle 9).

### Commits

1. `feat(frontend)`: the sort. `view.test.ts` cases for case ("alice" and
   "Bob"), an accented name among its base letter ("Ålice" and "Bob"), two equal
   names fed in descending id order, a name with leading spaces ("  Zed" and
   "Bob"), numbered names ("Dev 10" and "Dev 2"), and a blank name. Case, in
   `room.spec.js`: four participants' order, read with a retrying
   `expect(participantEntries(page)).toHaveText([/Ålice/, /bob/, /Dev 2/, /Dev 10/])`,
   so it cannot read before the fourth arrives. The names make each browser's
   collator apply the accent, case and numeric rules.
2. `test(frontend)`, added after review: a `view.test.ts` case for "alice"
   before "Alice", so the collator's case rule bites on its own.
3. `docs`: this step's status line, as the PR's last commit before merge.

### Accepted costs

- Names the collator holds equal, such as "Dev 02" and "Dev 2", are ordered by
  id: arbitrary per room, but the same for every viewer.
- The e2e case passes against an unsorted list in one run of twenty-four.
- The pinned locale has no failing case: a test runner in English collates the
  same without it.

## Appendix A. Review of the current page (2026-09-30)

Input to step 3 and the pool for steps 5 and after, not a list of commitments.
It comes from reading the code and from one product owner's account of how
their teams run sessions.

### How sessions run

- Teams are usually split between a meeting room and remote workers; about 30%
  of sessions are fully remote and 10% fully on site.
- One product owner facilitates. They share the ticket (Jira) full screen first,
  to read it and explain context, then switch to this app full screen to follow
  the vote and press Show, Re-vote, Clear and edit the issue. The share goes to
  the room's screen and to the call (Teams or Meet, per customer).
- Product owners never vote. With two or three in a room, auto-reveal never
  fires.
- Everyone, on site or remote, joins both the call and the app on a laptop. Some
  put the app on an external monitor; many use the laptop screen alone.
- Room screens range from a 40 inch TV, small from the back for poor eyesight,
  to a 60 inch TV and a 2 by 3 m projector whose contrast suffers in a lit room.
- Rooms hold 4 to 14 people, 12 being a regular upper bound.
- Estimates mostly mean development and QA time.

### Keep

1. Almost no friction: a pinned URL and a name, no account, no install, and a
   reload rejoins.
2. Hidden values with visible ticks: who voted is public, what they voted is
   not, until the reveal.
3. The server decides the reveal, and everyone sees the same round.
4. Equal controls: anyone can Show or Clear, which fits a small team that
   trusts itself.
5. One screen and one fixed deck: no settings, no navigation.
6. Honest notices, such as "Reconnected. Please check your vote."

### Improve

1. **Hierarchy.** Before anyone votes, the most prominent text in a room is the
   "Pointing Poker" heading; after, the 85 px own card. Neither is the issue.
   The issue, the deck, who is missing and the result share one card at
   similar weights, where each phase has one thing that matters: the issue and
   your card while voting, the result after the reveal.
2. **The layout ignores the phase.** After the reveal the frozen deck still
   holds the top half and the result appears below it, which is the layout
   shift in `docs/known-issues.md`. A layout that follows the phase makes the
   result the main thing once revealed.
3. **Progress is a table column.** Knowing whether to wait means counting check
   icons. "4 of 6 voted", with the missing names, answers it at a glance.
4. **Participants as a spreadsheet.** Three columns and two icons for nearly one
   idea, one of them (`ShieldOff`, a hidden vote) hard to guess. Name chips that
   turn over on reveal would carry the card metaphor and fit a narrow screen.
5. **Results show only the mode.** "Most voted estimation" picks arbitrarily on
   a tie, and the count table sorts by count. The discussion after a reveal is
   about the spread: the lowest and highest voters and how far apart they are.
   A distribution in deck order, with those names, serves it.
6. **The deck.** Thirteen buttons at `min-width: 4em` in grid columns wrap
   untidily when narrow; cards want touch-sized targets, about 44 px, in a grid
   that reflows. The unconfirmed state after a Re-vote is a pale tint with no
   words, and it is the state most likely to confuse.
7. **"Next issue" takes two actions.** `clear()` resets the round and keeps the
   issue, so moving on is Clear, then pencil, type and save. Probably the most
   frequent action of a session.
8. **The issue is a form field.** It is the context everyone reads, and usually
   a pasted ticket key or link, so it wants headline weight and a clickable
   link.
9. **The lobby.** On a pinned link it already hides the tabs, but still shows
   the room id as a read-only form field above the name, where a heading
   would do. At `/` it leads with Create and Join tabs of equal weight. "User
   name" reads better as "Your name".
10. **Feedback far from its cause.** "Link copied" appears as an alert at the top
    of the page and pushes the room down; it belongs beside the button. Stacked
    alerts push content in general.

### Remove or avoid

1. The large "Your estimation" card, which repeats the selected card at 85 px.
   It may survive as a phone's "your card" if the deck collapses after voting.
2. Red for everything. Show, Re-vote, Clear, the cards and the result are all
   reds, while red conventionally means danger, and Clear, the one destructive
   action, is a red outline like the cards, at the other end of the row from a
   filled red Show, with nothing marking it destructive. The brand colour is an
   accent, and destructive actions get their own treatment.
3. Information only on hover, which phones do not have.
4. Layout shifts on reveal or on a notice.
5. Scope creep toward a platform: accounts, a gating facilitator role,
   onboarding tours, avatars, sounds, gamification, settings pages.
6. A confirmation dialog on routine actions; protect Clear by position and
   styling, or later by undo.
7. Colour or an icon alone as a state; words first, icons beside them.

### Experience guidelines

1. One screen, two phases: voting shows the issue, the deck and progress;
   revealed shows the issue, the result and the spread, then Next issue or
   Re-vote.
2. One obvious next action per phase.
3. The facilitator's page reads in a small video tile and from the back of a
   room.
4. On a phone the page is a remote: the issue at the top, the deck within thumb
   reach, the result near the deck after the reveal, which keeps the deck
   (step 3).
5. Words over icons for state.
6. Calm and fast: little chrome, small motion such as a card turning on reveal,
   off under `prefers-reduced-motion`.

A rough sketch of the phase idea, a voter's page on a laptop:

```
 VOTING                                    REVEALED
+------------------------------------+    +------------------------------------+
| brave-golden-otter    Copy . Leave |    | brave-golden-otter    Copy . Leave |
|                                    |    |                                    |
| PROJ-123  Export session history   |    | PROJ-123  Export session history   |
|                                    |    |                                    |
| [0][.5][1][2][3][5][8][13][21]..[?]|    |   5          spread: 3 to 8        |
|                                    |    |   3 | 5 5 5 | 8                    |
| 4 of 6 voted, waiting: Bob, Eve    |    |   low: Ann (3)   high: Bob (8)     |
| (Ann v)(Bob .)(Cyd v)(Dan v) ...   |    | (Ann 3)(Bob 8)(Cyd 5)(Dan 5) ...   |
|                     [Show votes]   |    |  [Re-vote]            [Next issue] |
+------------------------------------+    +------------------------------------+
```

The revealed sketch leaves the disabled deck out for space; step 3 keeps it.

## Appendix B. Inputs for step 4a

What step 1a's first design learned about announcing the round, kept for step
4a's spec. Provisional, like the plan.

**Constraints.**

- One element, step 3's phase line, with `role="status"`: rendered from the
  room's mount and the same element for the room's life, checked with step 1a's
  region helper, since text already there when an element appears is not announced.
- Never `role="alert"`: a phase change, often from someone else's Show, is
  routine news that should not cut off what the screen reader is saying.
- Never empty: it holds the open text while the round is open, so a reopened
  round changes its text and is announced too.
- Placed as step 3 places it, and covering no card, for the "banner covers no
  card" case.
- No state of its own: it renders from `votesRevealed`, and is announced
  exactly when `votesRevealed` changes within the same mounted room, and silent
  when it appears.
- The phase text alone: a progress on the same line is a separate element
  outside the region, or every vote, join and leave would read the line aloud.

**The matrix.**

| Event | Holds the open text | Holds the revealed text |
| --- | --- | --- |
| Show, or auto-reveal | becomes revealed: announced | Show: unchanged; auto-reveal: cannot happen, a revealed round takes no vote |
| Re-vote | unchanged: not announced | becomes open: announced |
| Clear | unchanged: not announced | becomes open: announced |
| A `/role` switch to facilitator that completes the round (step 2b) | becomes revealed: announced | unchanged |
| Any other snapshot (a vote that does not complete the round, a join or leave, an issue edit) | unchanged | unchanged |
| Stream lost, or an invalid snapshot dropped, before a reconnect | unchanged | unchanged |
| In-place reconnect, the round changed meanwhile | becomes revealed: announced | becomes open: announced |
| In-place reconnect, the round changed and changed back | unchanged: not announced | unchanged: not announced |
| Join, or a reload, including the one after a refusal | appears with the current text: not announced | likewise |
| Leave | the page unloads | likewise |

**Accepted costs, expected to carry over.**

- A join or reload into a revealed round is not announced. After a refusal,
  "Reconnected. Please check your vote." is the cue, though it too is present
  when it appears, so it is found in reading order rather than announced.
- A Clear while the round is open is not announced: the line does not change,
  and the voter's own card simply stops being pressed.
- A late Re-vote, landing after another or after a Clear, finds the round open
  and only unconfirms votes, unannounced.
- A round that changes and changes back during a connection gap is not
  announced. After a Re-vote that means a vote silently becomes unconfirmed.

## Appendix C. Inputs for step 4's cases

What this design's reviews found about writing step 4's cases, kept for its
spec. Provisional, like the plan.

- "Moves nothing" records the header's elements, Copy link, Leave and the room
  id, as well as the round's elements; "covers nothing" checks the hint's box
  overlaps none of those same elements. Both run at the laptop target and at
  320 px, where "beside" may not fit.
- The copy hint becomes a `role="status"` region beside "Copy link": always
  rendered, empty until a copy, holding "Link copied to clipboard" for the 2 s,
  and checked with step 1a's region helper. Swapping today's `alert` role
  alone would silence it, since a status that appears with its text is not
  announced. A second copy within the 2 s changes no text and is not announced
  again, which is accepted.
- The phase line's height is reserved by sizing, such as a `min-height`, not by
  keeping the revealed text rendered and hidden as `Deck.tsx` does today: step
  4a needs text that changes in place.
- Its height is compared before a reveal and after it, which covers a reopening
  too, at the laptop target and at 320 px, and across a vote that changes a
  progress sharing its line. Today's "the reveal
  notice claims its space before the reveal" case runs at the default viewport
  only.
- Its placement: at a narrow width with the first card scrolled to the
  viewport's centre, pinned with `scrollIntoView({ block: 'center' })` rather
  than left to Playwright's default, the phase line is in the viewport and
  precedes the deck in reading order.
- The banners are the connection messages, moved and restarted. Moved and
  restarted show together from `?moved=1&restarted=1`; the connection messages,
  lost and ended, and the lobby errors share one slot, `connectionMessage ||
  error`, and never show together, so at most three show at once: one
  connection message or lobby error, moved and restarted.
- Playwright has no browser-zoom API, so the zoomed cases divide the viewport by
  the factor, as principle 5's "a 640 px layout" does; CSS `zoom` would not
  trigger the `min-width` queries.
