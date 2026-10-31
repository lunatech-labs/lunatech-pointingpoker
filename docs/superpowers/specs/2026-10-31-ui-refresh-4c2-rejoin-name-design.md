# UI Refresh, Step 4c2-rejoin-name: The Rejoin Row Joins With the Typed Name

Date: 2026-10-31
Status: Approved
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4

## Purpose

The lobby's rejoin row reads the name in the field but joins with the stored
one: with Alice stored and Bob typed it reads "Rejoin as Bob" and joins as
Alice. 3b4 (`docs/superpowers/specs/2026-10-19-ui-refresh-3b4-lobby-design.md`)
accepted this "as today"; it dates from step 1c at least and is tracked
nowhere else. This step makes the row join as it reads. It is a behaviour
change, so it is its own step between 4c2-form, which draws the row, and
4c2-banners.

Cause (checked, `App.tsx`): the row is a plain link to `/<id>`; the typed
name reaches `localStorage` only through `keepLobby()`, which Create and Join
run; the room path's mount effect joins with the stored name.

## Terms

The parent's Terms hold, and 3b4's: **lobby**, **root form**, **room row**.

- **Lobby submit**: Create, Join, and from this step the rejoin row's click.
  Each runs `keepLobby()`, which stores the name, and the shown default role
  only when none is stored (`keepDefault`).

## Decisions

1. **The rejoin row's click is a lobby submit.** It runs `keepLobby()`
   unchanged, then the link navigates as today. Rejected: the label reads
   the stored name, honest but the user's edit still ignored; recording it in
   `docs/known-issues.md` and leaving it (product owner's ruling).
2. **The shown default role is stored as on any lobby submit**, with no rule
   of its own. In practice none is new: a room is remembered only once
   reached, the mount join needs a stored default, and the join form stores
   one (checked, `App.tsx`); only storage from before the roles step lacks
   one (inferred: no code removes the default). There the click now stores
   it, so the room joins at mount where it showed its join form.
3. **An empty or blank name follows Create and Join** (product owner's
   ruling), replacing the stored name. An empty one makes the room page skip
   its join at mount and show its join form; a blank one joins as a blank
   row, the parent's open "Names checked at join". Today the row joins with
   the stored name.
4. **The link keeps its native navigation**: no `preventDefault`, no
   scripted `location.assign`, so a new-tab click and the link's role stay.
   `localStorage.setItem` is synchronous, so the name is stored before the
   page unloads.
5. **Wiring**: `RoomRow` gains an optional `onClick`, set on the link only
   (the badge has no click); `LobbyForm`'s `rejoin` gains `onClick: () =>
   void`; `App` sets it to `keepLobby`.

## States and events

The row shows only at `/` with a remembered room. States are the name field
against the stored name.

| Event \ field | A name other than the stored one | The stored name | Empty |
|---|---|---|---|
| Click, or Enter on the link | Stores the typed name; the room joins with it | Stores nothing new; as today | Stores the empty name; the room page shows its join form (decision 3) |
| Ctrl- or Cmd-click | As a click, the room in a new tab; this tab stays in the lobby | As a click | As a click |
| Middle-click | Stores nothing; the new tab joins with the stored name (Accepted costs) | As today | As today |

The room's remembered role decides the seat, as on Join (`joinRole`). The
lobby's inert look cannot meet the row: only the pinned form can end (3b4
Terms), and the row shows only at `/`.

## Accepted costs

- A middle-click opens the room with the stored name, since it fires
  `auxclick`, not `click`. Recorded here only; not worth an `onAuxClick`.

## Contract

The existing cases pass unchanged: 'the lobby offers the remembered room
rather than joining it' (`lobby.spec.js`) and 'a room remembered from before
the cutover reopens under its derived name' (`slug.spec.js`) click the row
with the stored name in the field; 'the lobby scrolls no page sideways, 320
by 640' (`layout.spec.js`) only finds the row.

One new case, a behaviour of its own with a setup of a few lines (product
owner's ruling), shown to fail by the mutation named. If it does not fail
under its mutation, the plan stops and the case comes back here.

- **'the rejoin row joins with the name typed over the stored one'**
  (`lobby.spec.js`): Alice joins, then at `/` the name field is filled with
  Bob, the row reads "as Bob", and after its click the room's participant
  entry for Bob shows (`participantEntry`). Mutation: `RoomRow` puts no
  `onClick` on the link.

Left without a case: the empty name, which runs `keepLobby()` as Create and
Join do; the new-tab and middle-click paths.

## The docs' changes

- **Parent**: the step table gains a 4c2-rejoin-name row after 4c2-form,
  "The rejoin row joins with the typed name", depending on 4c2-form, judged
  by "Its case, and the existing cases unchanged"; 4c2-banners then depends on 4c2-rejoin-name. The step 4
  paragraph gains, after 4c2-form, "4c2-rejoin-name, the rejoin row joining
  with the typed name", with this document's path.
- 3b4's spec, delivered, stays as written.

## Branches and commits

One PR on `20260930.ui_refresh_4c2_rejoin_name`, stacked on 4c2-form's
`20260930.ui_refresh_4c2_form` (#476): this document, the parent's change and
its plan first; then the row's click with its case.
