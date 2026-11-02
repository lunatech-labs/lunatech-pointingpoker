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
changes the value source, as 3b may: one token added, one removed.

The designer's Figma drew a landing and an invite page. It was a conversation
opener made before the designer had used the app, so it informs the look and
binds nothing.

## Terms

- **Lobby**: `Lobby.tsx`'s page, in the two forms below. The lobby has no phase.
- **Root form**: at `/`, with the Create and Join tabs. No stream ever opens
  here: Join and Create load a new page.
- **Pinned form**: on a room's own path, with no tabs and the room fixed. The
  only form with a stream, so the only one that can be lost or ended. A stored
  name and default role join it at once on load (2c), but the lobby shows until
  the first snapshot.
- **Not-a-room page**: the 404 for a name outside the slug vocabulary
  (`PageRoutes.notARoom`), with a suggestion when one name is nearest. The
  server decides and answers; the page is a React page (decision 15).
- **Header bar**: the room page's ground, hairline, height and brand lockup.
  The lobby has no breakpoint, so the room header's narrow-width changes do not
  apply.
- **Brand lockup**: the room header's mark and "Pointing Poker", in Inter bold.
- **Room row**: a box holding a square in `--card-back`, a room id in monospace
  and, as a link, a second line and an arrow. As a link the whole row is the
  link, and its name is its content in visible order, `<id> <line 2>`, with no
  `aria-label`. The square is plain (the mark is only in the lockup), a shape
  without text; the arrow is ink. The pinned form's badge is the same row
  without the second line and the arrow.
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
   narrow screen. `--page-max` does not apply. At 24rem the longest valid name,
   26 characters, fits on one line in the suggestion's row; at phone width an
   id wraps at its hyphens and is never cut, in a row and in the badge.
4. **No hero panel and no marketing copy.** The people at `/` already know the
   app, the form is the point, and a hero would add a breakpoint and copy to
   keep.

**The headings and rows**

5. **The `h1` names the form.** On a pinned link it is "Join room", with the
   room id below it in the room row's badge, plain text and no heading. At `/`
   it is the active tab's form, "Create room" or "Join room". Dismiss's focus
   lands on the `h1` (3b3 decision 5). The pinned form's read-only "Room id"
   field goes.
6. **The tabs are links named Create and Join**, hidden on a pinned link. The
   active one is marked `aria-current="true"` (they switch a view on one page,
   so not `"page"`), and states differ by shape, never by red against ink (J4,
   J8).
7. **The default-role row is restyled radios in a row.** It stays a group named
   "Your default role" with radios Voter and Facilitator, described by the
   existing help line word for word. The help line stays against the radios,
   with the larger gap after it. Set aside: a segmented bar, where a filled
   cell reads as the room's action, like the button.
8. **The rejoin link is a room row, above the tabs and on both**, at `/` only.
   Line 1 is the room id, or "your last room" for a legacy id; line 2 is
   "Rejoin as <name>", and without a name just "Rejoin", so its name is
   `<id> Rejoin as <name>`. Line 2 is underlined, J4's cue; a link drawn as a
   button (9, 14) is not, its shape being the cue.
9. **One burgundy-filled control per page**: the primary. On a form it is the
   primary button. Where the room row is the page's primary, as on the
   not-a-room page, its arrow is a small burgundy chip with a white arrow, the
   page's one such control.

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
    decision 10's muted text and edge, extended to the fields and the radios,
    on `--paper-pale`: `--grey` on `--track` is 6.47:1, under the 7:1 floor, and
    on `--paper-pale` 7.06:1. No new token. An inert control's edge is exempt
    from J8's 3:1 (WCAG 1.4.11 exempts inactive components).
    `disabled` is native, so focus falls to the page; the only way out is a
    reload (Accepted costs). Set aside: removing the form, which reads as a
    page that did not load. The message text is unchanged.

**The not-a-room page**

12. **It is drawn in the lobby's regions**: the header bar, then a panel in the
    same column. Its `h1` is the sentence, the typed name in a `<code>`, in
    monospace, wrapped in a `<bdi>`, wrapping anywhere and never cut, so a
    pasted bidi character cannot reorder it.
13. **A suggestion is the lobby's own widget.** "Did you mean" is plain text,
    then the room row: the suggested name, and "Join as <name>" below, the
    whole row a link to `/<suggestion>`. The name is the browser's stored name,
    which the pinned form prefills; an empty stored name counts as none. With
    none the line reads "Join". The row is the page's primary (9).
14. **The secondary action is "Join a different room"**, not "Create a room",
    since the user came to join. With a suggestion it is an outlined button;
    with none it is the burgundy primary (9) and the page's only action. It
    leads to `/` open on the Join tab, by a URL flag read at load that step 4
    builds, such as `?tab=join`.
15. **The not-a-room page is built in React.** The lobby's room row is one
    component, so the page imports it with the lobby's tokens and fonts, and
    the row's markup is written once. The server keeps deciding
    (`PageRoutes.notARoom`, `Suggestion`) and answers 404, a status that must
    survive for crawlers and link previews. Set aside: the server writing the
    page's HTML, which keeps a second copy of the row's markup and styles and
    needs a script to read the stored name. Whether the page is an entry point
    of its own or a view of the room app, and how the server hands over the
    typed name and the suggestion, are open: step 4's brainstorm raises them
    first. A visitor reaches the page through the lobby's Join or a mistyped
    link, so JavaScript is there.

## States and events

The problem slot shows one message at a time: ended, then lost, then a failure
(`connectionMessage || error`). Rows are events, columns what shows.

The root form:

| Event | None | Failed |
| --- | --- | --- |
| Join with an empty room id (`doJoin`) | failed | the join text replaces it |
| Join with an id, or a successful Create | page load | page load |
| Create fails (`doCreate`) | failed, with the create text | the create text replaces it |
| Create pressed during a create | a second room is created, as today (known issues) | same |
| A tab switch | same | same: the failure stays across it |
| A page load | starts over | starts over |

The pinned form. None includes a join in flight and a join answered "joined"
that awaits its first snapshot.

| Event | None | Failed | Lost | Ended |
| --- | --- | --- | --- | --- |
| A join answered "failed" (`joinHere`) | failed | same | cannot happen (a join after a stream is ignored) | cannot happen |
| A join answered "joined" | none | none | cannot happen | cannot happen |
| Join pressed while a stream exists (`join` answers "ignored") | nothing happens; the name is stored, not sent | cannot happen (no stream) | same | cannot happen (disabled) |
| The stream errors before the first snapshot (an errored stream, a stale reopen, a refused first frame) | lost | cannot happen (a failed join opens no stream) | same | cannot happen (the stream is stopped) |
| The stream opens or reopens (`onopen`) | none | cannot happen | none: the banner clears and the panel moves up | cannot happen |
| The first snapshot arrives | the room | cannot happen | the room | cannot happen |
| A closed stream, the app answers 200, the room never reached (`check`) | lost, then ended (a close sets lost first) | cannot happen | ended | cannot happen (the stream is stopped) |
| A page load | starts over | starts over | starts over | starts over |
| Any other event | same | same | same | same |

A page load starts over: no message, except the notices a URL carries (3b3's
table). A failure stays until a join answers "joined" or the page loads, as
today, so retyping does not clear it.

The not-a-room page has no states: it shows a suggestion or not (13).

Accepted race: Dismiss pressed during the auto-join puts focus on the `h1`,
which drops when the room mounts; it needs one human within a round trip.

## Accepted costs

- A failure that repeats unchanged is not announced twice by a screen reader,
  because the message text does not change (inferred, a known issue; the fix is
  app code).
- Join stays live from a press until the first snapshot, and a click does
  nothing. On a slow connection there is no sign of progress; a "Joining…"
  look is left open.
- On "session ended" the one retry is the user's reload, which stops a loop the
  page cannot tell from a transient failure (`check`'s comment). A Reload
  button in the message would do it in one click; it adds an action to a
  problem, which J6's messages do not have, so it waits on its own decision.
- A full URL pasted into the Join field gets the not-a-room page, since
  `doJoin` only trims; accepting one is a behaviour change, left open.
- The rejoin link follows the typed name, but the next page joins with the
  stored one: with Alice stored and Bob typed it reads "Rejoin as Bob" and
  joins as Alice, as today.

## Contract

No e2e case changes in this step; it draws no app code. Step 4 lists these
contract changes, as principle 9 asks:

- The active tab is marked, `aria-current="true"`: a new attribute, one case.
- "User name" becomes "Your name": one line, `nameInput`'s label in
  `e2e/fixtures.js`, and no case changes.
- The rejoin link's name becomes `<id> Rejoin as <name>`, so the lookups in
  `lobby.spec.js` and `slug.spec.js` change. Step 1c may re-frame them first
  as a link whose name contains the room id, or "your last room", so that each
  passes on today's page and on the new one. Lookups by `name: 'Join'` match
  substrings, so step 4 confirms they stay unique beside the row or use
  `exact`.
- The pinned form's read-only "Room id" field goes; no case reads it there.
- The not-a-room page is React, so `APISpec.scala`'s assertions on its markup
  (`<code>x</code> is not a room name.`, `Did you mean <a href="/x">x</a>?`,
  `<a href="/">Create a room</a>`) move to e2e cases on the rendered page: the
  sentence with the typed name, "Did you mean" absent without a suggestion, and
  "Join a different room". `APISpec` keeps the 404 status and what the server
  hands over (the typed name and the suggestion), and its case "escape the
  refused name before echoing it" stays, rewritten for the hand-over: in
  whatever form the name travels, it cannot inject markup or script (a
  `</script>` in inline JSON included). `slug.spec.js` keeps reading "is not a
  room name".
- New cases: focus on the lobby's `h1` after Dismiss (3b3 decision 5), the
  `h1` naming the active form, the suggestion row reading "Join as <name>"
  with a stored name, and "Join a different room" opening `/` on the Join tab.
- The Create, Join and role controls keep their roles and names; the role group
  and its description are unchanged.

## The docs' changes

- **Parent** and **3b3**: pointers to this spec, and the parent's 3b4 line
  naming the lobby's arrangement at every width, done with the spec.
- **Value source**: `--lobby-width` added to `tokens.css`, `--font-serif`
  removed from it (J7 draws no serif, so nothing uses it), and `--card-back`'s
  purpose comment in `colours.css`, with the reasons in the reference's log;
  the gate's checks follow.
- **Mockup**: `docs/design/lobby.html`, on the same tokens, with parameters for
  the page (the root form, the pinned form or the not-a-room page), the tab,
  the name empty or prefilled, a remembered room (slug, legacy or none), each
  message (the ended message implying the inert look), the typed name and the
  suggestion, the longest id at phone width, and `rejoin=chip`, the
  outlined-chip variant of the row's arrow, the plain arrow the default;
  `docs/design/lobby-cells.html` beside it, as `room-cells.html` is.
- **Reference**: L9 leaves Open for a section, J13, on the lobby and the
  not-a-room page, including the underline rule (8) and the wrapping (3); J7's
  pointer to L9 becomes J13 and says the brand lockup is Inter, with no serif;
  the Mockups list gains the lobby's two files; the log gains a 3b4 entry.
  Open gains each open Accepted cost, the choice between the two arrow
  variants, and three row variants deferred for the designer, not rejected: no
  square with an outlined "Rejoin" button on the right, with the outlined arrow
  chip on the right, and with it in the square's place on the left. Open also
  gains the not-a-room page's React shape (15) and the saving look's text
  contrast (the inert look's correction).
- **Known issues**: the repeated identical failure that a screen reader may not
  announce, a pasted URL in the Join field, and Create pressed during a create
  making two rooms.

## Branches and commits

One PR on `20260930.ui_refresh_3b4_lobby`, stacked on 3b3's
`20260930.ui_refresh_3b3_issue_editor_and_messages` (#453): this document and
the parent's change first, then the mockup, then the reference and known
issues.
