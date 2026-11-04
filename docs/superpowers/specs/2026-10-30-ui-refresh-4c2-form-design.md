# UI Refresh, Step 4c2-form: The Lobby's Page and Form

Date: 2026-10-30
Status: Approved
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4

## Purpose

4c2, the lobby's look, runs as three steps (product owner's ruling), each
judged its own way:

- **4c2-form**, this one: the lobby's page and form as 3b4
  (`docs/superpowers/specs/2026-10-19-ui-refresh-3b4-lobby-design.md`) and
  `docs/design/lobby.html` draw them, with 3b4's contract changes.
- **4c2-banners**: the lobby's banners in `Message`, in a Messages section
  that mounts only while a banner shows; Dismiss focuses the `h1`; `Alerts`
  goes.
- **4c2-bootstrap**: Bootstrap, its Dependabot pin, `bootstrap-undo.css`, the
  `legacy` layer and the `legacy-page` fence go, with the ruling on the tap
  highlight; judged by the existing cases unchanged.

This step hands 4c2-banners the banners' place, the column above the panel,
and an `h1` that takes focus by script (`tabIndex={-1}`, as the mockup's).
4c2-banners hands 4c2-bootstrap a page where no element carries `legacy-page`
or a Bootstrap class. The not-a-room page and the Join tab's URL flag stay
4d's.

## Terms

The parent's Terms hold, and 3b4's: **lobby**, **root form**, **pinned
form**, **header bar**, **brand lockup**, **room row**.

- **The longest id**: `fearless-speckled-flamingo`, 26 characters, three
  words of the slug vocabulary (checked, `Vocabulary.scala`), the mockup's
  `longest=1`.

## Decisions

1. **The column is 26rem** (product owner's ruling, on the mockup at
   1280 by 700). `--lobby-width` leaves "provisional". Measured there:

   | Width | Share of the page's width | Longest id fills its line | Help line | Height ÷ width, Create / Join / pinned |
   | --- | --- | --- | --- | --- |
   | 24rem | 30% | 90% | 3 lines | 1.27 / 1.49 / 1.08 |
   | 26rem | 33% | 79% | 2 lines | 1.12 / 1.32 / 0.95 |
   | 28rem | 35% | 70% | 2 lines | 1.04 / 1.23 / 0.88 |

   Set aside: 24rem, the narrowest keeping the longest id on one line, which
   it nearly fills; 28rem, which turns the pinned panel landscape. Below the
   cap, on a phone, the width does not matter. No width in this range answers
   the column looking alone on a wide screen, which follows from 3b4
   decision 4 (no hero).
2. **The room row's arrow is the plain ink arrow** (product owner's ruling).
   Set aside: the outlined chip, a box with no role of its own, since the
   whole row is the link, which mirrors the square; its consistency with the
   not-a-room page's burgundy chip spans two pages seldom seen in a row. The
   mockups drop `rejoin=chip`; the three row variants deferred for the
   designer stay open.
3. **One component per CSS prefix** (4c1-wide decision 2): `LobbyPage` (the
   header bar, the column, the banners' place and the panel), `LobbyTabs`,
   `LobbyForm` (the `h1`, the Join tab's room field, the name, the roles and
   the primary button) and `RoomRow` (the rejoin link, and the pinned form's
   badge without its second line and arrow, the same `.room-row` box,
   checked in `room-row.css`). `Lobby` goes, and `DefaultRole`
   folds into `LobbyForm`, whose classes it draws with (my call). How `App`
   hands `LobbyPage` the form is the builder's.
4. **`BrandLogo` with `brand-logo.css`** (my call, as 4c1-banners decision 1
   moved `.message`): the mark and "Pointing Poker", which `RoomHeader` and
   `LobbyPage` both draw. The `.brand-logo` rules leave `looks.css`, with the
   forced-colours block, which holds only `.brand-logo` (its comment reworded
   to say so), and `BrandLogo` imports `brand-logo.css` as `Message`
   imports `message.css`; `room-header.css`'s overrides stay there and win by
   specificity (`.room-header .brand-logo`). Set aside: a `Brand` function
   exported from `RoomHeader.tsx` with the rules left in `looks.css`, a second
   exception beside `Figure`; the mark's SVG written twice.
5. **`Alerts` move into the banners' place for now**, in a `legacy-page`
   fence of their own, losing their `row` and `col-md-8 offset-md-2`
   wrappers, which inside the column would narrow and shift them. The fence
   wraps `Alerts` alone, empty when none shows; the Messages section and its
   gap are 4c2-banners'. App's `container legacy-page` wrapper goes. Set
   aside: `Alerts` above the header, which moves them twice.
6. **The rejoin row's second line keeps today's name rule** (product owner's
   ruling): "Rejoin as <name>" with the name as typed, and "Rejoin" for an
   empty one. A blank name waits on the parent's "Names checked at join". Set
   aside: trimming here, as the mockup did, a behaviour change of its own.
7. **Enter keeps today's rule**: it submits from the name field alone, on
   keyUp (the parent's step 1). No `<form>` element, which would make Enter in
   the room field submit too.

## States and events

3b4's tables hold unchanged: this step draws the same states. The `h1`
follows the tab, and a failure stays across a tab switch, as today. Only the
pinned form can end (3b4 Terms), so the inert look never meets Create.

## Accepted costs

- Until 4c2-banners the lobby's banners keep Bootstrap's look, in the new
  column.

## Contract

The changes 3b4 listed, checked against the cases:

- **"User name" becomes "Your name"**: `nameInput` in `e2e/fixtures.js`, and
  'the lobby is drawn in Inter' (`fonts.spec.js`) reading the label's text.
- **The headings read "Create room" and "Join room"**: `fonts.spec.js`'s
  lookups of 'Create Room' pass unchanged, a role name matching
  case-insensitively by substring (Playwright's default).
- **The rejoin link's name becomes `<id> Rejoin as <name>`**: 'the lobby
  offers the remembered room rather than joining it' (`lobby.spec.js`) and 'a
  room remembered from before the cutover reopens under its derived name'
  (`slug.spec.js`) pass unchanged, finding it by the id or "your last room"
  and its text by "as Alice", as step 1c reworded them. Lookups of the Join
  tab by `name: 'Join'` meet the row's "Rejoin" as they meet today's link's;
  no existing case clicks the tab with a room remembered.
- **The pinned form's "Room id" field goes**: `roomIdInput` is read only on
  the root form's Join tab (`lobby.spec.js`, `roles.spec.js`,
  `slug.spec.js`).
- **'today's lobby stays centred and keeps Bootstrap's form spacing'**
  (`fonts.spec.js`) goes: it checks the fence around today's markup. The
  centring moves to the layout case below.
- The Create, Join and role controls keep their roles and names; the role
  group and its description are unchanged.

New cases, each shown to fail by the mutation named. If a case's setup does
not fail under its mutation, the plan stops and the case comes back here.
Both follow the lean test budget (the parent's step 4).

- **'the h1 names the form and the active tab is marked'** (`lobby.spec.js`):
  at `/`, the `h1` reads "Create room", the Create link has
  `aria-current="true"` and the Join link no `aria-current` at all
  (`lobby-tabs.css` matches the attribute's presence); after the Join link,
  "Join room", the marks swapped. Then on the longest id's path with nothing
  stored, the `h1` reads "Join room", the id shows, and no tab link and no
  "Room id" field are found by role. Mutations: the `h1` fixed at "Create
  room"; `aria-current={tab === which}`, which renders `"false"` on the other
  link; the tabs drawn on a pinned form; the room field drawn on a pinned
  form.
- **'the lobby scrolls no page sideways, 320 by 640'** (`layout.spec.js`,
  Chromium): a visitor remembering the longest id with a stored name, at `/`
  on the Join tab, reached by `getByRole('link', { name: 'Join', exact:
  true })` past the rejoin row (the row, the tabs and every field): the page
  does not scroll sideways, and the panel's left and right gaps to
  `document.body`'s `clientWidth` are equal, as the replaced fonts case
  measured, since `page.css`'s scrollbar gutter narrows the body in Chromium
  (checked on the mockup at 320 px: 20 and 20 px; without the auto margins,
  0 and 40). Mutations: the
  column without its `min()`, at 26rem; the column without
  `margin-inline: auto`.

Left without a case, as the mockup shows them by eye: the pinned form at
320 px, which shares the column and the row's box with the case's page; the
arrow, the radios' look, the inert look's colours (3b4 decision 11,
`refusal.spec.js` keeping Join disabled), and the longest id wrapping at its
hyphens.

## The docs' changes

- **Parent**: the step table's 4c2 row splits into 4c2-form, 4c2-banners and
  4c2-bootstrap, each with its judgement as Purpose gives it; the step 4
  paragraph's 4c2 sentence names the three; "Names checked at join" gains a
  minimum length (product owner, 2026-10-30).
- **`frontend/src/tokens.css`**: `--lobby-width: 26rem`, its comment naming
  this step's judgement.
- **`docs/design/lobby.html`** and **`lobby-cells.html`**: the `rejoin`
  parameter goes: `lobby.html`'s parameter comment, `chip` and the
  `room-row-go-chip` rule, and in `lobby-cells.html` its options, its state
  and its `src` template; `room-row.css`'s comment drops its `rejoin=chip`
  clause; and `lobby.html`'s `typedLabel` drops its trim
  (decision 6). `lobby.html` and `room.html` link `brand-logo.css` beside
  `looks.css` (decision 4).
- **`docs/design/ui-reference.md`**: J13's column is 26rem, judged, where it
  says "24 rem until judged"; Open loses the column width and the arrow; the
  Mockups list's shared stylesheets name `brand-logo.css` and its `lobby.html`
  parameters drop `rejoin`; the log gains a 4c2-form entry for decisions 1, 2
  and 4.
- **`docs/known-issues.md`**: "On a phone, the lobby and its banners now lay
  out at the phone's width, unchecked" narrows, title, Where and Issue, to the
  lobby's banners in their own fence and the hand test, the root form pinned
  at 320 px by the new layout case and the pinned form sharing its column
  and row.
- 3b4's and 4c1-banners' specs, delivered, stay as written.

## Branches and commits

One PR on `20260930.ui_refresh_4c2_form`, stacked on 4c1-banners'
`20260930.ui_refresh_4c1_banners` (#475): this document, the parent's change
and its plan first; then `BrandLogo` with `brand-logo.css` (judged by the
existing cases unchanged); then the lobby's page and form with their cases,
the token and the docs' changes.
