# UI Refresh, Step 3b4: The Lobby

Date: 2026-10-19
Status: In discussion
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 3

## Purpose

Step 3b4 draws the lobby, the reference's L9: the page at `/` and the page on a
room's own path before the room is reached. It takes the lobby's messages, which
3b3 left to it (`docs/superpowers/specs/2026-10-16-ui-refresh-3b3-issue-editor-and-messages-design.md`,
decision 1), and the banner mechanics 3b3 settled (its decisions 2 to 6). The
product owner judges it on `docs/design/lobby.html`, then the specialist, who
judges all four 3b steps. It changes no app code: step 4 builds the page.

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
- **Room row**: a box holding a square in `--card-back`, a room id in monospace
  and, as the link on the root form, "Rejoin as <name>" below it and an arrow.
  The pinned form's badge is the same row without the second line and the
  arrow.
- **Brand lockup**: the room header's mark and "Pointing Poker", in Inter bold.
- **Banner**, **problem**, **notice**: 3b3's.

## Decisions

**The shape**

1. **The Create and Join tabs stay**, restyled. On a pinned link they are
   hidden, as today. Restructuring them is a behaviour change with its own
   steps: nobody reaches `/` often, since a team's room is bookmarked and
   shared as a link, and typing an id into Join is the rare path.
2. **One column at every width, labels above their fields, no breakpoint.** The
   panel has a maximum width and shrinks to the screen. A banner pushes it
   down, as the room page's banners push the page.
3. **No hero panel and no marketing copy.** The people at `/` already know the
   app, the form is the point, and a hero would add a breakpoint and copy to
   keep. The page is dressed by the panel, the brand lockup and the palette.

**The headings and rows**

4. **The `h1` names the form.** On a pinned link it is "Join room", with the
   room id below it in the room row's badge, plain text and no heading. At `/`
   it is the active tab's form, "Create room" or "Join room". The brand lockup
   sits above it, and Dismiss's focus lands on the `h1` (3b3 decision 5). The
   pinned form's read-only "Room id" field goes.
5. **The tabs are links named Create and Join**, hidden on a pinned link. The
   active one is marked `aria-current="true"` (they switch a view on one page,
   so not `"page"`), and states differ by shape, never by red against ink:
   links stay ink and underlined (J4, J8).
6. **The default-role row is restyled radios in a row.** It stays a group named
   "Your default role" with radios Voter and Facilitator, described by the
   existing help line word for word. The help line sits against the radios it
   explains, with a larger gap after it than between the other rows, before the
   primary button. Set aside: a segmented bar, where a filled cell reads as the
   room's action, like the button.
7. **The rejoin link is the room row, the whole row the link.** Line 1 is the
   room id, or "your last room" for a legacy id; line 2 is "Rejoin as <name>",
   and without a name just "Rejoin". Its name is derived from this content, so
   what is seen is what is read: `<id> Rejoin as <name>`. The mark is in the
   brand lockup only, so the square is plain; one shape serves the link and the
   badge.
8. **Each form has one burgundy-filled control**, its primary button. The
   square is `--card-back`, a shape without text, as the header's mark is.

**The messages**

9. **The lobby's messages are banners above the panel**, 3b3's mechanics and
   roles (a problem is `role="alert"`), in a Messages section that mounts only
   while a banner shows. They are the join failure, the create failure,
   "Connection to the room was lost", "Your session has ended" and, from a
   URL's flag, the moved link and the restart notices. "Link copied" is not
   here (3b1 decision 7). Set aside: messages inside the panel, which needs a
   second mechanism, and "session ended" does not fit one.
10. **After "Your session has ended" the panel stays and its three controls are
    inert**: the name, the roles and Join, as `disabled` is today, in 3b3
    decision 10's look (the saving look, extended to the fields and the
    radios, with no new token). An inert control's edge is exempt from J8's 3:1
    (WCAG 1.4.11 exempts inactive components); its text stays at the 7:1 floor.
    `disabled` is native, so focus falls to the page: nothing can be retried,
    the only way out being a reload. Set aside: removing the form, which reads
    as a page that did not load. The message text is unchanged.

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
- A full URL pasted into the Join field gets the server's "is not a room name"
  page, since `doJoin` only trims; accepting one is a behaviour change, left
  open.
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
- New cases: focus on the lobby's `h1` after Dismiss (3b3 decision 5), and the
  `h1` naming the active form.
- The Create, Join and role controls keep their roles and names; the role group
  and its description are unchanged.
- `frontend/src/colours.css`'s `--card-back` purpose comment gains the room
  row's square; it is the value source, so it is step 4's build.

## The docs' changes

- **Parent** and **3b3**: pointers to this spec, done with the spec.
- **Parent**: step 3's 3b4 line drops "the lobby's breakpoint" for its
  arrangement at every width.
- **Mockup**: `docs/design/lobby.html`, on the same tokens, with parameters for
  the tab, the pinned form with the name empty or prefilled, a remembered room
  (slug, legacy or none) and each message, the ended message implying the inert
  look; `docs/design/lobby-cells.html` beside it, as `room-cells.html` is.
- **Reference**: L9 leaves Open for a section, J13, on the lobby; J7's pointer
  to L9 becomes J13 and says the brand lockup is Inter, with no serif; the
  Mockups list gains the lobby's two files; the log gains a 3b4 entry. Open
  gains the Reload button, the "Joining…" look, the pasted URL and a
  decorative element with no text.
- **Known issues**: the repeated identical failure that a screen reader may not
  announce, and a pasted URL in the Join field.

## Branches and commits

One PR on `20260930.ui_refresh_3b4_lobby`, stacked on 3b3's
`20260930.ui_refresh_3b3_issue_editor_and_messages` (#453): this document and
the parent's change first, then the mockup, then the reference and known
issues.
