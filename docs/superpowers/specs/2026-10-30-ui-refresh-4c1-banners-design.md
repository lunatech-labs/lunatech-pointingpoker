# UI Refresh, Step 4c1-banners: The Banners' Look and Place

Date: 2026-10-30
Status: Approved
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4

## Purpose

4c1-wide built the room page but left the banners in `App`'s `legacy-page`
wrapper, above the header, in Bootstrap's look (its decisions 1 and 3), and
4c1-editor handed them on (its decision 1). This step draws them under the
header as 3b3 designed
(`docs/superpowers/specs/2026-10-16-ui-refresh-3b3-issue-editor-and-messages-design.md`,
decisions 2 to 6) and `docs/design/room.html` (`message=lost,moved,restarted`)
draws, and extracts the message panel 4c1-editor wrote by hand (its plan's
R3). The
lobby's banners stay legacy until 4c2.

## Terms

The parent's Terms hold, and 3b3's: **banner**, **problem**, **notice**,
**Messages section**, **message panel**.

- **The room page's banners**: the lost connection (a problem), the moved link
  and the restart (notices). No other message reaches the room page (checked):
  `connection.ts` sets `fatal` only while the snapshot is null, a join that
  succeeds clears `error`, and a create that succeeds loads a new page.
- **The flags**: `App`'s `moved` and `restarted` state, read from the URL on
  load, and `room.lost`.

## Decisions

1. **One `Message` component, with `.message` moved into `message.css`**
   (product owner's ruling). `Message` takes a tone (problem or notice), an
   optional role, an optional `onDismiss`, and its words as children, and draws
   3b3's panel: the tone's icon (`TriangleAlert`, `Info`), the words in a `p`,
   and, given `onDismiss`, an `X` icon button named "Dismiss"; the role sits on
   the panel holding the button, where the fixtures look Dismiss up. The `.message`
   rules leave `looks.css` for `message.css` beside it, so 4c1-wide decision 2's
   rule (one component per CSS prefix, named after it) holds and `Figure` stays
   its one exception. IssuePanel's two messages use it, with no role, as
   today. Set aside: `Message` with `.message` left in `looks.css`; no
   component, three hand-written panels.
2. **`RoomPage` draws the Messages section between the header and `main`**,
   the `section` with class `room-page-banners` named "Messages", which
   `room-page.css` already styles: lost as a problem, `role="alert"`, the
   notices `role="status"`, as `Alerts` gives them. `App` passes the flags,
   `lost` a boolean (the room page has one problem text, my call), and the two
   dismiss handlers to `RoomPage` and renders `Alerts` only while the snapshot is null,
   for the lobby. The flags stay in `App`, so a notice dismissed on the lobby
   stays dismissed in the room.
3. **On the phone the banners take the column's side margin**, `--space-3`,
   which the panels and the header use there, not `--page-edge` (product
   owner's ruling, by the mockup at 390 px, where they sat 8 px inside the
   issue panel's edges). One rule in `room-page.css`'s phone container query;
   the mockup follows, sharing the file. Set aside: keeping `--page-edge`,
   which lines them up with nothing on the phone.
4. **Dismiss focuses the room id**: `RoomHeader`'s `h1` takes
   `tabIndex={-1}` and Dismiss focuses it (3b3 decision 5). How `RoomPage`
   reaches the `h1` is the builder's.
5. **The issue panel is the region "Issue"**, by an `aria-label` on its
   `section` (product owner's ruling). The table and the round bar are named
   regions and the roster a named landmark (3b1's Contract), and the panel's
   one heading holds the issue, which names nothing stable. The round panel
   stays unnamed, as its deck and its results carry names. Set aside:
   `aria-labelledby` on that heading, a name that changes each round.

## States and events

3b3's banner table holds unchanged. This step adds where the banners show;
rows are events, columns the page shown.

| Event | Lobby (snapshot null) | Room page |
| --- | --- | --- |
| A page load with a flag in the URL | the notice in `Alerts`, legacy look | cannot happen (no snapshot at load) |
| The first snapshot arrives | the room page mounts; the notices not dismissed show under its header, `Alerts` unmounts, and the snapshot clears `lost` | n/a |
| `room.lost` set (a drop, a stale stream, a refusal) | the alert in `Alerts`, legacy look, as today (`onerror` can fire before the first snapshot, checked) | the alert joins the Messages section, mounting it if none showed |
| The stream reopens, or a snapshot arrives | n/a | the alert leaves; the section unmounts if no notice shows |
| Dismiss pressed | the notice goes; focus stays where the browser leaves it (the lobby's is 4c2's) | the notice goes; focus on the `h1` (but for the copy hint, Accepted costs); the section unmounts if nothing else shows |
| Leave, a reload, the restart reload, a page restored from the back/forward cache | starts over (a page load) | starts over (a page load, checked: `connection.leave` assigns `/`) |
| The room page to the lobby without a page load | n/a | cannot happen: the snapshot is never reset to null (checked, `connection.ts`) |

Accepted race: as 3b3's, a drop and return between two paints shows nothing.

## Accepted costs

3b3's Accepted costs hold. Added:

- On a room path, a notice from the URL shows in the lobby's legacy look until
  the first snapshot, then moves under the header in the new look; the
  auto-join makes this a flash, a typed join a longer stay. 4c2 ends it.
- On the phone, Dismiss within 2 s of Copy link leaves focus on the page, the
  copy hint hiding the `h1` (`room-header.css`).

## Contract

One contract addition, the region "Issue" (decision 5). Nothing changes:
`movedBanner`, `restartNotice` and `connectionLost` find
the banners by role and text, and refusal.spec and slug.spec press Dismiss by
name inside them, which hold;
'an old UUID link opens its derived room under a banner that covers no card'
(`slug.spec.js`) hit-tests every card for any `status`, which the banners in
the flow above `main` never cover; IssuePanel's message cases are unchanged by
decision 1; no existing region read matches the name "Issue" (checked). `fixtures.js`
gains `messages`, the region "Messages" by role and name (3b1's contract),
and `issuePanel`, the region "Issue".

Grown and new cases, each shown to fail by the mutation named. If a case's
setup does not fail under its mutation, the plan stops and the case comes back
here. Each acts only once the room shows (`inRoom`), so neither cuts before
the auto-join nor presses the lobby's legacy Dismiss.

- **Grown: 'no page scrolls sideways'** (`layout.spec.js`, Chromium), at
  320 by 640 only, as its copy check already is, sharing its setup (product
  owner's ruling). As its last step, after the copy, Alice's stream is cut and
  left cut (`cleanStub` restores it at teardown; a restore could reload onto
  `?restarted=1`): the region's three panels read lost, moved, restarted; the
  region lies below the header and above the issue panel; each panel's left
  and right edges match the issue panel's; and the page does not scroll
  sideways with all three shown. Mutations: the section above the header; the
  section after `main`; the notices before the problem; decision 3's rule
  dropped.
- **New: Dismiss focuses the room id and the section unmounts**
  (`room.spec.js`): after `?moved=1&restarted=1`, each Dismiss, pressed
  through its notice (`movedBanner`, `restartNotice`), hides that notice and
  leaves the `h1` focused; after the second, no Messages region.
  Mutations: no focus call; no `tabIndex` on the `h1`; the section mounted
  while empty.

Left without a case: a banner arriving on a scrolled page staying above the
view (3b1 decision 3), the browser's scroll anchoring, unchanged here; and
decision 3's rule written outside the phone query, which the wide page shows
by eye as banners 8 px past the panels.

## The docs' changes

- **`docs/design/room.html`** and **`docs/design/lobby.html`** link
  `message.css` beside `looks.css` (decision 1); `room.html`'s issue panel,
  in both its views, takes `aria-label="Issue"` (decision 5).
- **`docs/design/ui-reference.md`**: J11's cap bullet says the banners, like
  the header, share the column's edges in the phone layout (decision 3); the
  Mockups line names `message.css` beside `looks.css`; "The banners'
  region 'Messages' waits for 4c1-banners" becomes made by it, beside the
  region "Issue"; the log gains a 4c1-banners entry for decisions 1, 3 and 5.
- **`docs/known-issues.md`**: "On a phone, the lobby and the banners now lay
  out at the phone's width, unchecked" narrows to the lobby and its banners,
  the room page's banners pinned by the grown sideways case and the editing
  view drawn since 4c1-editor.
- 3b3's, 4c1-wide's and 4c1-editor's specs, delivered, stay as written; this
  one closes 4c1-wide's accepted cost of the banners above the header.

## Branches and commits

One PR on `20260930.ui_refresh_4c1_banners`, stacked on 4c1-editor's
`20260930.ui_refresh_4c1_editor` (#474): this document and its plan first,
then `Message` with `message.css` (judged by the existing cases unchanged),
then the banners under the header with their cases and the docs' changes.
