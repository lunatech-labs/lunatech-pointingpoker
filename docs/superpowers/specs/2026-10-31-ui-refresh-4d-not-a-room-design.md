# UI Refresh, Step 4d: The Not-a-Room Page

Date: 2026-10-31
Status: Draft
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4

## Purpose

The not-a-room page is still the server's bare HTML (`PageRoutes.notARoom`):
the sentence, a "Did you mean" link and "Create a room", with none of the
lobby's look. 3b4 (`docs/superpowers/specs/2026-10-19-ui-refresh-3b4-lobby-design.md`,
decisions 12 to 15) drew it in the lobby's regions, built in React, and the
mockup holds it (`docs/design/lobby.html?page=notaroom`). This step builds it
as drawn (product owner's ruling) and settles the two questions 3b4 left to
step 4's brainstorm: the page's React shape, and how the server hands over
the typed name and the suggestion.

## Terms

The parent's Terms hold, and 3b4's: **lobby**, **root form**, **pinned
form**, **not-a-room page**, **room row**.

- **Hand-over**: the element the server inserts into the page to tell the
  app it is on the not-a-room page, with the typed name and the suggestion
  (decision 2).
- **Join flag**: `?tab=join` on `/`, which opens the root form on the Join
  tab (3b4 decision 14).
- **Stored name**: `localStorage`'s `name`, which the pinned form prefills
  and the rejoin row reads (checked, `App.tsx`).

## Decisions

1. **The page is a view of the room app**, as the lobby and the room are
   (checked: one entry, `App` choosing `LobbyPage` or `RoomPage`).
   `main.tsx` looks for the hand-over before anything else: with one it
   renders `NotARoom` and never creates the connection, whose construction
   adds `window` listeners (checked), so it moves into the other branch;
   without one it runs as today. The split sits above `App` because `App` auto-joins its path on
   mount (checked). Rejected: an entry of its own, a second Vite input and a
   second HTML shell to keep in step with the first, to prevent a mistake in
   one line of `main.tsx` that a case guards (Contract).
2. **The hand-over is a meta element**, inserted before the first `</head>`:
   `<meta name="not-a-room" content="<typed>" data-suggestion="<slug>">`,
   `data-suggestion` left out with no suggestion. Both values are encoded
   with `Encode.forHtml`, the OWASP encoder the page uses today, which is
   built for text and quoted attributes; attribute values are entity-decoded
   by the parser, so the app reads them back as typed. Rejected: a JSON block
   in a `<script>`, whose safety needs a hand-made rule on top of the encoder
   (`<` written as `\u003c`, since the HTML parser ends the element at
   `</script` inside a JSON string), while `forHtml` there would leave
   entities undecoded; the app reading the typed name from its own URL,
   which splits one fact between Pekko's decoder and `decodeURIComponent`
   (inferred: it throws on a malformed `%` sequence) and leaves `APISpec`
   unable to check it.
3. **The server keeps deciding.** The route is unchanged: a name outside the
   vocabulary, after the mixed-case redirect, gets the not-a-room page. It
   answers 404 with `Cache-Control: no-cache`, the shell read per request as
   text with the hand-over inserted. With the shell not built it answers 503
   with `notBuilt`, as `/` and a room path do. The shell always carries
   `</head>` (checked, the built `index.html`); its module script runs after
   parsing, so the meta is in the document when `main.tsx` reads it.
4. **`NotARoom` draws the mockup** in `LobbyPage`, not ended and with no
   banners: the `h1` `lobby-page-title`, `<code><bdi>typed</bdi></code> is
   not a room name.`; with a suggestion, "Did you mean" as a
   `lobby-page-lead` paragraph, then the room row linking to
   `/<suggestion>`, its line 2 "Join as <stored name>", or "Join" with none,
   its arrow the burgundy chip (`room-row-go-primary`, through a new optional
   `primary` on `RoomRow`); then "Join a different room", a link to
   `/?tab=join` drawn as `button-outline` with a suggestion and
   `button-primary` without. An empty stored name counts as none, as on the
   rejoin row (`name ? … : …`, untrimmed; the mockup trims, my call to follow
   the app). The document title becomes "Not a room name", today's title, set
   by `main.tsx` in its branch.
5. **The join flag is read with the other flags.** `App` reads `tab=join`
   beside `moved` and `restarted` at load, starts on the Join tab with it,
   and removes it with the same `history.replaceState`, so a copied link is
   clean (product owner's ruling); a reload then opens on Create. Any other
   `tab` value is ignored and left in the URL, as `moved=0` is today. On a
   room's path the pinned form has no tabs, and the flag is only removed.
   Flags together, such as `?tab=join&moved=1`, are each read and all
   removed by the one call.
6. **The page needs the server.** Vite's dev server answers every path with
   the shell and no hand-over, so the page shows only on the built page
   served by `sbt run`, where the by-eye checks run (my call: no dev shim).

## States and events

The page has no states of its own (3b4); what it shows is fixed at load by
the hand-over and the stored name.

| Event \ load | Suggestion, a stored name | Suggestion, none stored | No suggestion |
|---|---|---|---|
| Load | Sentence; row "Join as <name>", the primary; outlined "Join a different room" | As left, row "Join" | Sentence; "Join a different room" the primary and the only action |
| The row's click | `/<suggestion>`: the pinned form joins at once with the stored name and default role (2c) | `/<suggestion>`: the pinned form, empty | cannot happen |
| "Join a different room" | `/?tab=join` → `/`, Join tab, flag removed | same | same |
| Reload, Back or Forward to the page | The server answers again: same page | same | same |
| Storage changed in another tab | Not seen until reload (Accepted costs) | same | cannot happen |

On the shell: a request for the page with the shell not built answers 503
(decision 3); a hand-over without `content` cannot happen, the server
writing both.

## Accepted costs

- Crawlers and link previews, which run no script, see the 404 with the
  shell's title "Pointing Poker" and no sentence; today they see "Not a room
  name" and the sentence. The status is what 3b4 required to survive.
- The page loads the room app's bundle, the same hashed files the lobby
  loads and caches for a year, so the next page fetches nothing new
  (inferred).
- A stored name with no stored default role reads "Join as <name>", but the
  room shows its pinned form, prefilled; only storage from before the roles
  step lacks a default (inferred, 4c2-rejoin-name decision 2).
- The row reads the stored name once, at load, as the pinned form does.

## Contract

`APISpec` keeps the 404 and checks the hand-over; the page's text moves to
e2e cases (3b4's Contract). Each new or changed assertion is shown to fail by
the mutation named; if one does not fail, the plan stops and the case comes
back here.

- **'refuse a name outside the vocabulary with a page suggesting the
  correction'**: 404, `text/html`, the fixture shell, and the meta with
  `content="brave-golden-oter"` and `data-suggestion="brave-golden-otter"`.
  The fixture shell gains a `<head></head>`. Mutation: no suggestion
  written.
- **'refuse a name near no room name without a suggestion'**: the meta
  present, `data-suggestion` absent. Mutation: the attribute always written.
- **'escape the refused name before echoing it'**: the input gains a `"`,
  `/%22%3E%3Cimg%20src=x%20onerror=alert(1)%3E`; the page holds `&#34;&gt;&lt;img`
  and no `<img` nor `">`. Mutation: `Encode.forHtml` removed.
- **New, beside the not-built cases**: a name outside the vocabulary with
  the shell not built answers 503. Mutation: the not-a-room page skips the
  built check.
- **'a mistyped room name is refused with a suggestion that reaches the
  room'** (`slug.spec.js`) passes unchanged (inferred: its link lookup by
  `brave-golden-otter` matches the row, "brave-golden-otter Join") and
  gains the heading `brave-golden-oter is not a room name.` by role.
  Mutation: `main.tsx` ignores the hand-over.
- **New, 'a name near no room name offers only Join a different room, which
  opens the Join tab'** (`slug.spec.js`): `/nothing-like-this` answers 404,
  the heading shows, "Did you mean" is absent, and the link "Join a
  different room" leads to `${origin}/` with the Join tab current
  (`aria-current`). Mutations: the flag not read (Create current); the flag
  not removed (the URL keeps `?tab=join`); the suggestion block drawn
  without a suggestion.
- **New, 'a mistyped name offers to join as the stored name, and opens no
  stream'** (`slug.spec.js`): storage seeded with Alice and a default role
  (`fixtures.js`'s seeded page), `/brave-golden-oter` shows a row reading
  "Join as Alice", no request reaches `/rooms/` before the click, and the
  click joins at once. Mutations: line 2 ignores the stored name; `main.tsx`
  mounts `App` beside `NotARoom`.

Incidental, flagged for the product owner: the title "Not a room name", one
assertion in the first case. Left without a case: the client's escaping,
React's text nodes; the bidi wrapping and the longest name, checked by eye
against the mockup at 320 wide, with and without a suggestion, in both
browsers.

## The docs' changes

- **Parent**: step 4's paragraph gains this document's path after "4d, the
  not-a-room page"; the Steps table stands.
- **Reference** (`docs/design/ui-reference.md`): Open's "The not-a-room
  page's React shape" entry leaves Open; the log gains a 4d entry for
  decisions 1 and 2.
- **Known issues**: the pasted-URL entry stands, still true.
- 3b4's spec, delivered, stays as written.

## Branches and commits

One PR on `20260930.ui_refresh_4d_not_a_room`, stacked on 4c2-focus-ring's
`20260930.ui_refresh_4c2_focus_ring` (#480): this document, the docs' changes
and the plan first; then the app's view and flag; then the server's
hand-over with its cases, so each commit leaves the suite green.
