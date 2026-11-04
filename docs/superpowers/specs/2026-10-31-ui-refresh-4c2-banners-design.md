# UI Refresh, Step 4c2-banners: The Lobby's Banners in the New Look

Date: 2026-10-31
Status: Approved
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4

## Purpose

4c2-form drew the lobby's page and form and moved `Alerts`, Bootstrap's
markup in a `legacy-page` fence of its own, into the banners' place, the
column above the panel (its decision 5). This step draws the lobby's banners
as 3b4 designed
(`docs/superpowers/specs/2026-10-19-ui-refresh-3b4-lobby-design.md`, decision
10) and `docs/design/lobby.html` (`message=…`) draws them: message panels in a
Messages section that mounts only while a banner shows, Dismiss focusing the
`h1`. Both pages draw that section with one component. `Alerts` goes, so no
element carries `legacy-page` or a Bootstrap class, which 4c2-bootstrap needs
(4c2-form's Purpose).

## Terms

The parent's Terms hold, and 3b3's and 3b4's: **banner**, **problem**,
**notice**, **Messages section**, **message panel**, **lobby**, **root
form**, **pinned form**.

- **The problem text**: App's `connectionMessage || error`, the one problem
  shown, by 3b4's order: the ended session, then the lost connection, then a
  join or create failure (checked, `App.tsx`). Empty when none shows.
- **The flags**: App's `moved` and `restarted` state, read from the URL on
  load.
- **The dismiss target**: the element a Dismiss focuses, the one carrying
  `data-dismiss-focus` (decision 3), which is the page's `h1` (3b3 decision
  5). Each page that draws banners has exactly one: the room page's room id
  (`RoomHeader`) and the lobby form's `h1` (`LobbyForm`).

## Decisions

1. **One `Banners` component draws the Messages section on both pages**
   (product owner's ruling). It takes the problem text, the flags and their
   two dismiss handlers, and draws `<section class="banners"
   aria-label="Messages">` only while a banner shows: the problem as a problem
   panel, `role="alert"`, then the moved notice, then the restart notice, each
   `role="status"` with a Dismiss, all through `Message`. A Dismiss focuses
   the dismiss target, then calls its handler. The notice texts, the order by
   tone and the roles, written today in both `Alerts` and `RoomPage`, are
   then written once. Set aside: LobbyPage drawing its own section as RoomPage
   does, which keeps them twice.
2. **App draws `Banners` once and hands it to the page shown** (product
   owner's ruling). App passes the problem text, so every problem text is
   written once, in App; on the room page it is the lost text or empty, since
   `fatal` is set only while the snapshot is null and a join that succeeds
   clears `error` (checked, `connection.ts`, `App.tsx`). LobbyPage keeps its
   `banners` slot; RoomPage's `lost`, `moved`, `restarted` and two dismiss
   handlers become the same slot. This reverses 4c1-banners decision 2's
   props; what the room page shows is unchanged. Set aside: each page taking
   the five props and drawing `Banners` itself, which wires them twice.
3. **`Banners` finds the dismiss target by a marker** (product owner's
   ruling). Both `h1`s keep `tabIndex={-1}` and gain `data-dismiss-focus`,
   which `Banners` queries; RoomPage's ref and `dismiss` wrapper and
   RoomHeader's `idRef` go. The marker names the target on purpose, so a
   second `h1` or a moved heading changes nothing. Set aside:
   `querySelector('h1')`, which leans on the page having one `h1` by
   accident; a ref threaded from App to each `h1`, props on both paths; an
   empty element made to take focus, which a screen reader announces as
   nothing; a case counting the markers, which reads page structure (the
   parent's test contract) and fails only where a focus check already does.
4. **`banners.css` owns `.banners`; each page places it by context**
   (product owner's ruling). `banners.css` holds the stacking (a column,
   `--space-2` apart). `room-page.css` and `lobby-page.css` keep their
   placement, re-selected as `.banners` inside the page: `room-page.css`'s
   rule with its scroll-anchoring comment and its phone rule (4c1-banners
   decision 3), and `lobby-page.css`'s, which nothing draws until this step.
   This follows `room-header.css` styling `.room-header .brand-logo` (4c2-form
   decision 4). `Banners` takes no class, so this step adds no exception to
   4c1-wide decision 2's rule (one component per CSS prefix). On a phone the
   lobby's column `min()` gives the banners the panel's edges, as the mockup
   draws them; no phone rule is needed (inferred; the layout case pins it).
   Set aside: no stylesheet, the page's class passed in, a second exception.
5. **The lobby's panel takes `data-testid="lobby-panel"`**, a contract
   addition (the parent's principle 9), read by a new `lobbyPanel` fixture:
   the layout case measures the banners against the panel, and nothing in
   the panel shares its edges, as the room view's root has the test id
   `room` (`inRoom`). Set aside: the panel as a named region, a landmark that
   only a test needs.

## States and events

3b3's banner table and 3b4's tables hold unchanged; this step changes how the
lobby draws them. Rows are events, columns the page shown; cells name only
the Messages section.

| Event | Lobby (snapshot null) | Room page |
| --- | --- | --- |
| A page load with a flag in the URL | the notice in the section | cannot happen (no snapshot at load) |
| The problem text set | the problem leads the section, mounting it if none showed | the lost text only (decision 2); it leads the section, mounting it if none showed |
| The problem text cleared (the stream opens, a join answers "joined") | the problem leaves; the section unmounts if no notice shows | the stream reopens or a snapshot arrives: the same |
| Dismiss pressed | the notice goes; focus on the dismiss target; the section unmounts if nothing else shows. After "session ended" too: the panel takes the inert look, not `inert`, so the `h1` takes focus | the same, but for the copy hint (4c1-banners' Accepted costs) |
| A tab switch (root form) | the section stays: a failure stays across it (3b4) | n/a |
| The first snapshot arrives | the room page mounts; the section shows under its header if a notice not dismissed remains | n/a |
| A page load: the root form's Join with an id or a Create that succeeds, the rejoin row, Leave, a reload, the restart reload, a page restored from the back/forward cache | starts over (the room page's Leave and restart reload cannot happen here) | starts over (Create, Join and the rejoin row cannot happen here) |
| The room page to the lobby without a page load | n/a | cannot happen (4c1-banners, checked) |
| Any other event | unchanged | unchanged |

Accepted races: 3b3's and 3b4's hold. 3b4's Dismiss during the auto-join
extends to a typed Join on the pinned form: the focused `h1` leaves when the
room mounts.

## Accepted costs

3b3's, 3b4's, 4c1-banners' and 4c2-form's hold, but for two this step ends:
4c2-form's "until 4c2-banners the lobby's banners keep Bootstrap's look", and
4c1-banners' "a notice from the URL shows in the lobby's legacy look until the
first snapshot".

## Contract

One contract addition, the lobby's panel's test id (decision 5), read by a
new `lobbyPanel` fixture. The lobby's region "Messages" is 3b1's contract
read, as 4c1-banners made it on the room page, now on the lobby too; the
`messages` fixture's comment names both pages. Nothing else changes: `movedBanner`, `restartNotice` and `connectionLost` find the banners
by role and text, `connectionAlert` by role; refusal.spec and slug.spec press
Dismiss by name inside them; 'a page refused before it reached the room stops
at the message' (`refusal.spec.js`) and 'a refused room creation says so'
(`slug.spec.js`) read the lobby's alert's text, which `Message` keeps as its
`p` beside an icon with no text (checked, lucide-react 1.49's `Icon` renders
its paths and no children here); no case reads `legacy-page`, `.alert` or
Bootstrap's `close` (checked).

The room page's cases now guard what `Banners` does for both pages: 'no page
scrolls sideways, 320 by 640' (`layout.spec.js`) the order, and 'Dismiss
focuses the room id, and the Messages section leaves with the last notice'
(`room.spec.js`) the focus call and the unmount. The lobby's cases pin only
the lobby's part.

New cases, each shown to fail by the mutation named. If a case's setup does
not fail under its mutation, the plan stops and the case comes back here.
Each runs in both browsers (the parent's principle 11), so the layout case
sits outside 'the narrow layouts'; neither pins incidental behaviour (3b4
decision 10, J13 and the dismiss target state what they check).

- **'the lobby's banners sit in the column above the panel, 320 by 640'**
  (`layout.spec.js`): on a pinned form with no stored name, at
  `/<room>?moved=1&restarted=1`, the region lies above the lobby's panel and
  each notice's left and right edges match the lobby's panel's. Mutations:
  the section after the panel; `{banners}` rendered outside the column
  (`LobbyPage`).
- **'Dismiss on the lobby focuses its h1'** (`lobby.spec.js`): the same page;
  one Dismiss, pressed through its notice, leaves the `h1` focused.
  Mutations: the lobby's `h1` without `tabIndex`; the marker off the `h1`.

Left without a case: the lost text on the lobby, which no case reads there;
it reaches `Banners` by the same problem text as the ended session, which
refusal.spec reads.

## The docs' changes

- **Parent**: the step 4 paragraph's 4c2-banners names this document's path.
- **`docs/design/room.html`** and **`docs/design/lobby.html`**: the section's
  class becomes `banners`, and each links `banners.css` beside `message.css`
  (decision 4); `room.html`'s room id and `lobby.html`'s form `h1`s take
  `data-dismiss-focus`, the room id with `tabindex="-1"` beside it, and
  `lobby.html`'s Dismiss focuses `[data-dismiss-focus]` for `h1` (decision 3).
- **`docs/design/ui-reference.md`**: J12's Dismiss moves focus to the dismiss
  target, the page's `h1` marked `data-dismiss-focus`; the Mockups line names
  `banners.css`; "Contract reads the look keeps" adds that 4c2-banners made
  the lobby's region "Messages" and gave the lobby's panel its test id; the
  log gains a 4c2-banners entry for decisions 1, 3 and 4.
- **`docs/known-issues.md`**: "On a phone, the lobby's banners now lay out at
  the phone's width, unchecked" loses `Alerts`' fence from Where, and from
  Issue "still Bootstrap's look inside their fence"; the lobby's banners are
  pinned at 320 px by the new layout case, the hand test remaining. "A screen
  reader hears the connection lost, but never that it came back" and "A
  failure that repeats unchanged is not announced twice by a screen reader"
  point at `Banners.tsx` for `Alerts.tsx`.
- 3b4's, 4c1-banners' and 4c2-form's specs, delivered, stay as written.

## Branches and commits

One PR on `20260930.ui_refresh_4c2_banners`, stacked on 4c2-rejoin-name's
`20260930.ui_refresh_4c2_rejoin_name` (#477): this document, the parent's
change and its plan first; then `Banners` with `banners.css` and the dismiss
target, RoomPage taking the slot (judged by the existing cases unchanged);
then the lobby on `Banners` with its cases, the panel's test id and the docs'
changes, `Alerts` removed.
