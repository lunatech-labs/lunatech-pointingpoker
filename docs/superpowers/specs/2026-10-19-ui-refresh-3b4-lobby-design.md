# UI Refresh, Step 3b4: The Lobby

Date: 2026-10-19
Status: In discussion
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 3

## Purpose

Step 3b4 draws the lobby, the reference's L9: the page at `/`, the page on a
room's own path before the room is reached, and the page a mistyped name lands
on. It takes the lobby's messages, which 3b3 left to it
(`docs/superpowers/specs/2026-10-16-ui-refresh-3b3-issue-editor-and-messages-design.md`,
decision 1), and the banner mechanics 3b3 settled (its decisions 2 to 6). The
product owner judges it on `docs/design/lobby.html`, then the specialist, who
judges all four 3b steps. It changes no app code: step 4 builds the pages. It
adds two tokens to the value source, as 3b may.

The designer's Figma drew a landing and an invite page. It was a conversation
opener made before the designer had used the app, so it informs the look and
binds nothing.

## Terms

- **Lobby**: `Lobby.tsx`'s page, in the two forms below. The lobby has no phase.
- **Root form**: at `/`, with the Create and Join tabs. No stream ever opens
  here: Join and Create load a new page.
- **Pinned form**: on a room's own path, with no tabs and the room fixed. A
  browser holding a remembered name and a default role joins it at once on
  load (2c), but the lobby shows until the first snapshot, so that user sees
  it briefly, name prefilled, and stays on it whenever the join fails, the
  stream is lost or the session ends. Only this form has a stream, so only it
  can be lost or ended.
- **Not-a-room page**: the server's 404 for a name outside the slug vocabulary
  (`PageRoutes.notARoom`), with a suggestion when one name is nearest. It is
  server HTML, not the React app.
- **Header bar**: the room page's, holding the brand lockup.
- **Brand lockup**: the room header's mark and "Pointing Poker", in Inter bold.
- **Room row**: a box holding a square in `--card-back`, a room id in monospace
  and, as a link, a second line and an arrow. The pinned form's badge is the
  same row without the second line and the arrow.
- **Banner**, **problem**, **notice**: 3b's.

## Decisions

**The shape**

1. **The Create and Join tabs stay**, restyled. On a pinned link they are
   hidden, as today. Restructuring them is a behaviour change with its own
   steps: nobody reaches `/` often, since a team's room is bookmarked and
   shared as a link, and typing an id into Join is the rare path.
2. **The lobby takes the room page's regions**: the header bar, full width and
   holding the brand lockup, then the body with the banners and the panel. The
   header's content, the banners and the panel share one left edge, in one
   centred column, as the room page's regions share the page edge.
3. **One column at every width, labels above their fields, no breakpoint.**
   The column is `--lobby-width`, a new token in the value source, 24rem until
   the mockup is judged, and `min(--lobby-width, 100% - 2 × --page-edge)` on a
   narrow screen. `--page-max` does not apply. A banner pushes the panel down,
   as the room page's banners push the page. At 24rem the longest valid name,
   26 characters, fits on one line in a room row and in the not-a-room page's
   typed name.
4. **No hero panel and no marketing copy.** The people at `/` already know the
   app, the form is the point, and a hero would add a breakpoint and copy to
   keep. The page is dressed by the regions, the lockup and the palette.

**The headings and rows**

5. **The `h1` names the form.** On a pinned link it is "Join room", with the
   room id below it in the room row's badge, plain text and no heading. At `/`
   it is the active tab's form, "Create room" or "Join room". Dismiss's focus
   lands on the `h1` (3b3 decision 5). The pinned form's read-only "Room id"
   field goes.
6. **The tabs are links named Create and Join**, hidden on a pinned link. The
   active one is marked `aria-current="true"` (they switch a view on one page,
   so not `"page"`), and states differ by shape, never by red against ink:
   links stay ink and underlined (J4, J8).
7. **The default-role row is restyled radios in a row.** It stays a group named
   "Your default role" with radios Voter and Facilitator, described by the
   existing help line word for word. The help line sits against the radios it
   explains, with a larger gap after it than between the other rows, before the
   primary button. Set aside: a segmented bar, where a filled cell reads as the
   room's action, like the button.
8. **The rejoin link is a room row, above the tabs and on both**, at `/` only,
   the whole row the link. Line 1 is the room id, or "your last room" for a
   legacy id; line 2 is "Rejoin as <name>", and without a name just "Rejoin".
   Its name is derived from this content, so what is seen is what is read:
   `<id> Rejoin as <name>`. The mark is in the brand lockup only, so the
   square is plain; one shape serves the link and the badge. The arrow is ink.
9. **One burgundy-filled control per page**: the primary. On a form it is the
   primary button; the square is `--card-back`, a shape without text. Where
   the room row is the page's primary, as on the not-a-room page, its arrow is
   a small burgundy chip with a white arrow, the page's one such control.

**The messages**

10. **The lobby's messages are banners above the panel**, 3b3's mechanics and
    roles (a problem is `role="alert"`), in a Messages section that mounts only
    while a banner shows. They are the join failure, the create failure,
    "Connection to the room was lost", "Your session has ended" and, from a
    URL's flag, the moved link and the restart notices. "Link copied" is not
    here (3b1 decision 7). Set aside: messages inside the panel, which needs a
    second mechanism, and "session ended" does not fit one.
11. **After "Your session has ended" the panel stays and its three controls are
    inert**: the name, the roles and Join, as `disabled` is today, in 3b3
    decision 10's look (the saving look, extended to the fields and the
    radios, with no new token). An inert control's edge is exempt from J8's 3:1
    (WCAG 1.4.11 exempts inactive components); its text stays at the 7:1 floor.
    `disabled` is native, so focus falls to the page: nothing can be retried,
    the only way out being a reload. Set aside: removing the form, which reads
    as a page that did not load. The message text is unchanged.

**The not-a-room page**

12. **It is drawn in the lobby's regions**: the header bar, then a panel in the
    same column. Its `h1` is the sentence, with the typed name on its own line
    in monospace and "is not a room name." below it, so the name wraps
    anywhere inside its line and is never cut. `<code>x</code> is not a room
    name.` stays in the markup.
13. **A suggestion is the lobby's own widget.** "Did you mean" is a label, then
    the room row: the suggested name, and "Join as <name>" below, the whole
    row a link to `/<suggestion>`. The name comes from the browser's stored
    name, filled in by a few lines of inline script; with none, or without the
    script, the line reads "Join". A returning user joins at once on arrival
    (2c), so "Join as <name>" is true. The row is the page's primary (9).
14. **The secondary action is "Join a different room"**, not "Create a room",
    since the user came to join. With a suggestion it is an outlined button;
    with none it is the burgundy primary and the page's only action. It leads
    to `/`, ideally open on the Join tab (Accepted costs).

## States and events

The problem slot shows one message at a time: ended, then lost, then a failure
(`connectionMessage || error`). Rows are events, columns what shows.

The root form:

| Event | None | Failed |
| --- | --- | --- |
| Join with an empty room id (`doJoin`) | failed | same |
| Join with an id, or a successful Create | page load | page load |
| Create fails (`doCreate`) | failed, with the create text | the create text replaces it |
| A tab switch | same | same: the failure stays across it |
| A page load | starts over | starts over |

The pinned form. None includes a join in flight and a join answered "joined"
that awaits its first snapshot.

| Event | None | Failed | Lost | Ended |
| --- | --- | --- | --- | --- |
| A join answered "failed" (`joinHere`) | failed | same | cannot happen (a join after a stream is ignored) | cannot happen |
| A join answered "joined" | none | none | cannot happen | cannot happen |
| Join pressed while a stream exists (`join` answers "ignored") | nothing happens | cannot happen (no stream) | nothing happens | cannot happen (disabled) |
| The stream errors before the first snapshot (an errored stream, a stale reopen, a refused first frame) | lost | cannot happen (a failed join opens no stream) | same | ended wins |
| The first snapshot arrives | the room | cannot happen | the room | cannot happen |
| A closed stream, the app answers 200, the room never reached (`check`) | ended | cannot happen | ended | same |
| A page load | starts over | starts over | starts over | starts over |
| Any other event | same | same | same | same |

A page load starts over: no message, except the notices a URL carries (3b3's
table). A failure stays until a join answers "joined" or the page loads, as
today, so retyping does not clear it.

The not-a-room page has no states: it shows a suggestion or not, and its
widget's second line reads "Join as <name>" or "Join".

Accepted race: Dismiss pressed during the auto-join puts focus on the `h1`,
which drops when the room mounts; it needs one human within a round trip.

## Accepted costs

- A failure that repeats unchanged is not announced twice by a screen reader,
  because the message text does not change (inferred, a known issue; the fix is
  app code).
- Join stays live between a join's answer and the first snapshot, and a click
  does nothing. On a slow connection there is no sign of progress; a
  "Joining…" look is left open.
- On "session ended" the one retry is the user's reload, which stops a loop the
  page cannot tell from a transient failure (`check`'s comment). A Reload
  button in the message would do it in one click; it adds an action to a
  problem, which J6's messages do not have, so it waits on its own decision.
- A full URL pasted into the Join field gets the not-a-room page, since
  `doJoin` only trims; accepting one is a behaviour change, left open.
- "Join a different room" should open the lobby on its Join tab, and the
  lobby opens on Create at `/`. The tab needs a flag read at load, such as a
  hash, which is app code for step 4; carrying the typed name into the Join
  field is a further option, open.
- The not-a-room page is server HTML, so building it means getting the styles
  into a page the server writes, and a script into a page that has none; both
  are open for step 4, including whether a content-security policy allows an
  inline script.
- The room id in the room row is a legacy UUID for a room remembered from
  before the cutover, so the row says "your last room" and shows no id.
- The rejoin link's text follows the name field as you type, as today.

## Contract

No e2e case changes in this step; it draws no app code. Step 4 lists these
contract changes, as principle 9 asks:

- The active tab is marked, `aria-current="true"`: a new attribute, one case.
- "User name" becomes "Your name": one line, `nameInput`'s label in
  `e2e/fixtures.js`, and no case changes.
- The rejoin link's name becomes `<id> Rejoin as <name>`, so the lookups in
  `lobby.spec.js` and `slug.spec.js` change. Step 1c may re-frame them first
  as a link whose name contains the room id, or "your last room", so that each
  passes on today's page and on the new one.
- The pinned form's read-only "Room id" field goes; no case reads it there.
- The not-a-room page: `APISpec.scala`'s two assertions on `Did you mean <a
  href="/x">x</a>?` change, since "Did you mean" becomes a label above a row.
  `<code>x</code> is not a room name.` stays, as `slug.spec.js` and `APISpec`
  read it.
- New cases: focus on the lobby's `h1` after Dismiss (3b3 decision 5), the
  `h1` naming the active form, and the suggestion row reading "Join as <name>"
  with a stored name.
- The Create, Join and role controls keep their roles and names; the role group
  and its description are unchanged.

## The docs' changes

- **Parent** and **3b3**: pointers to this spec, done with the spec.
- **Parent**: step 3's 3b4 line drops "the lobby's breakpoint" for its
  arrangement at every width.
- **Value source**: `--lobby-width` in `tokens.css` and `--card-back`'s purpose
  comment in `colours.css`, with the reasons in the reference's log; the
  gate's checks follow.
- **Mockup**: `docs/design/lobby.html`, on the same tokens, with parameters for
  the page (the root form, the pinned form or the not-a-room page), the tab,
  the name empty or prefilled, a remembered room (slug, legacy or none), each
  message (the ended message implying the inert look), the typed name and the
  suggestion, and `rejoin=chip`, the outlined-chip variant of the row's arrow,
  the plain arrow the default; `docs/design/lobby-cells.html` beside it, as
  `room-cells.html` is.
- **Reference**: L9 leaves Open for a section, J13, on the lobby and the
  not-a-room page; J7's pointer to L9 becomes J13 and says the brand lockup is
  Inter, with no serif; the Mockups list gains the lobby's two files; the log
  gains a 3b4 entry. Open gains the Reload button, the "Joining…" look, the
  pasted URL, the outlined-chip variant, the Join-tab flag and the server
  page's build, and a decorative element with no text.
- **Known issues**: the repeated identical failure that a screen reader may not
  announce, and a pasted URL in the Join field.

## Branches and commits

One PR on `20260930.ui_refresh_3b4_lobby`, stacked on 3b3's
`20260930.ui_refresh_3b3_issue_editor_and_messages` (#453): this document and
the parent's change first, then the mockup, then the reference and known
issues.
