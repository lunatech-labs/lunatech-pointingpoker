# UI Refresh, Step 3b4: The Lobby

Date: 2026-10-19
Status: In discussion
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 3

## Purpose

Step 3b4 draws the lobby, the reference's L9: the page at `/` and the page on a
room's own path before the room is reached. It takes the lobby's messages, which
3b3 left to it (`docs/superpowers/specs/2026-10-16-ui-refresh-3b3-issue-editor-and-messages-design.md`,
decision 1), and the banner mechanics 3b3 settled (its decisions 2 to 6). The
product owner judges it on `docs/design/lobby.html`, then the specialist on all
four steps. It changes no app code: step 4 builds the page.

The designer's Figma drew a landing and an invite page. It was a conversation
opener made before the designer had used the app, so it informs the look and
binds nothing.

## Terms

- **Lobby**: `Lobby.tsx`'s page, in the two forms below. The lobby has no phase.
- **Root form**: at `/`, with the Create and Join tabs.
- **Pinned form**: on a room's own path, with no tabs and the room fixed. A
  browser holding a remembered name and a default role joins it at once on
  load (2c), so this form is the first-timer's, and the one for a link that has
  no stored role.
- **Room row**: the box holding the mark, a room id in monospace and, as a link,
  "Rejoin as <name>" with an arrow.
- **Banner**, **problem**, **notice**: 3b3's.

## Decisions

**The shape**

1. **The Create and Join tabs stay**, restyled. On a pinned link they are
   hidden, as today. Restructuring them (Create leading, no tabs) is a
   behaviour change with its own steps: nobody reaches `/` often, since a
   team's room is bookmarked and shared as a link, and typing an id into Join
   is the rare path.
2. **One column at every width, labels above their fields, no breakpoint.** The
   panel is top-aligned with a maximum width and shrinks to the screen. A
   banner pushes it down, as the room page's banners push the page. J12's band
   rule does not apply: the lobby has one arrangement.
3. **No hero panel and no marketing copy.** The people at `/` already know the
   app, the form is the point, and a hero would add a breakpoint and copy to
   keep. The page is dressed by the panel, the brand line and the palette. A
   decorative element with no text may come later.

**The headings**

4. **On a pinned link the `h1` is "Join room"**, with the room id in a badge
   below it, plain text and no heading. The `h1` says what the page is for, to
   a first-timer first, and it is where Dismiss's focus lands (3b3 decision 5).
   "Pointing Poker" is a small brand line above it.
5. **At `/` the `h1` names the active form**, "Create room" or "Join room",
   changing with the tab, under the same brand line. The tab's name stays the
   link's.

**The rows**

6. **The tabs are links named Create and Join.** The active one has a thick ink
   bar and is marked for assistive technology (`aria-current`), and the other
   is an underlined ink link: links stay ink and are underlined, and states
   differ by shape (J4, J8).
7. **The default-role row is restyled radios in a row.** It stays a group named
   "Your default role" with radios Voter and Facilitator, described by the
   existing help line word for word. The help line sits against the radios it
   explains, with a larger gap after it than between the other rows, before the
   primary button. Set aside: a segmented bar, where a filled cell reads as the
   room's action, like the button.
8. **The rejoin link is a room row**, the pinned badge's shape: the app's header
   mark in a square of `--card-back`, the room id, "Rejoin as <name>" and a
   trailing arrow. The pinned badge is the same row without the arrow, so one
   shape serves a label and a link. The link keeps its name `Rejoin <room> as
   <name>`. If the mark is not legible on the square when the mockup is judged,
   both fall back to a plain square together.
9. **Each tab has one burgundy-filled control**, its primary button. The mark's
   square is `--card-back`, a shape without text, as the header's mark is.

**The messages**

10. **The lobby's messages are banners above the panel**, 3b3's mechanics: the
    problem has no Dismiss, the stack is ordered by tone, and the section
    mounts only while a banner shows. They are the join failure, the create
    failure and "Your session has ended", which share the problem slot, and the
    moved link and the restart notices, which a pinned link can carry. "Link
    copied" is not here: 3b1 decision 7 moves it beside Copy link. Set aside:
    messages inside the panel, which needs a second mechanism, and "session
    ended" does not fit one.
11. **After "Your session has ended" the panel stays and every control is
    inert**: the name, the roles, the primary button, the room id and the
    tabs, in J8's disabled look: flat fills, thin pale edges, and the text
    unchanged in contrast, since J8 allows no exception for disabled text. Set
    aside: removing the form, which reads as a page that did not load. Today
    only the name, the roles and Join are disabled, so Create, the room id and
    the tabs stay live; the rule is every control. The message text is
    unchanged, and a Reload button in it is left open (Accepted costs).

## States and events

The problem slot. Rows are events, columns what shows. `connectionMessage ||
error` makes it one message at a time, in the order ended, lost, failure.

| Event | None | Join or create failed | Lost | Ended |
| --- | --- | --- | --- | --- |
| A join on a pinned link answered "failed" (`joinHere`) | failed | same | lost wins | ended wins |
| A join on a pinned link answered "joined" (`joinHere`) | none | none | same | same |
| Join at `/` with an empty room id (`doJoin`) | failed | same | lost wins | ended wins |
| Join at `/` with an id, or a successful Create | page load | page load | page load | page load |
| Create fails (`doCreate`) | failed | same | lost wins | ended wins |
| The stream errors after a join, before the first snapshot | lost | lost | same | ended wins |
| The stream opens (a join reached its stream) | none | none | none | cannot happen (the stream was stopped) |
| The page never reached the room, its stream is refused and the app answers 200 (`check`) | ended | ended | ended | same |
| A tab switch | same | same | same | cannot happen (inert) |
| Any other event | same | same | same | same |

A page load starts over: no message, except the notices a URL carries (3b3's
table). A failure stays until a join answers "joined" or the page loads, as
today, so retyping does not clear it.

Accepted race: a join that fails twice with the same message changes nothing
on screen.

## Accepted costs

- A failure that repeats unchanged is not announced twice by a screen reader,
  because the message text does not change (inferred, a known issue; the
  fix is app code).
- On "session ended" the one retry is the user's reload, which stops a loop
  the page cannot tell from a transient failure (`check`'s comment). A Reload
  button in the message would do it in one click; it adds an action to a
  problem, which J6's messages do not have, so it waits on its own decision.
- A full URL pasted into the Join field leads to a wrong room, since `doJoin`
  only trims; accepting one is a behaviour change, left open.
- The mark's legibility on `--card-back` is a judgement of the mockup; its
  fallback is a plain square.
- A first-timer sees an empty name field and a returning user at `/` sees it
  prefilled; on a pinned link with a stored name and role no lobby shows.
  Both forms are drawn.

## Contract

No e2e case changes in this step; it draws no app code. Step 4 lists these
contract changes, as principle 9 asks:

- The active tab is marked (`aria-current`): a new attribute, one case.
- "User name" becomes "Your name" (the parent's observation 9), which changes
  `nameInput` in `e2e/fixtures.js` and every case that fills it. Step 1c may
  re-frame the lookup first, so the rename would be one line.
- New cases: focus on the lobby's `h1` after Dismiss (3b3 decision 5), the
  `h1` naming the active form, and every control inert once the session has
  ended, Create, the room id and the tabs included.
- The Create button, the Join button and the Join link keep their roles and
  names; the room row keeps `Rejoin <room> as <name>`; the role group and its
  description are unchanged.

## The docs' changes

- **Parent**: step 3's 3b4 line points here, as 3b3's does.
- **3b3**: its decision 1 gains a pointer here for the lobby's messages.
- **Mockup**: `docs/design/lobby.html`, on the same tokens, with parameters for
  the tab, the pinned form, a remembered room, each message and the inert
  state; `docs/design/lobby-cells.html` beside it, as `room-cells.html` is.
- **Reference**: L9 leaves Open for a section, J13, on the lobby; the Mockups
  list gains the lobby's two files; the log gains a 3b4 entry. Open gains the
  Reload button, the pasted URL and a decorative element.
- **Known issues**: the repeated identical failure that a screen reader may not
  announce, and a pasted URL in the Join field.

## Branches and commits

One PR on `20260930.ui_refresh_3b4_lobby`, stacked on 3b3's
`20260930.ui_refresh_3b3_issue_editor_and_messages` (#453): this document and
the parent's change first, then the mockup, then the reference and known
issues.
