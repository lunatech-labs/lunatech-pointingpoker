# Room QR Code Dialog

Date: 2026-11-23
Status: In discussion
Parent: issue #579, step 2 (step 1: the Copy link button, PR #580)

## Purpose

A phone joins a room shown on a desktop or a shared screen only by typing its link. This
step adds a "QR code" button beside Copy link that opens a dialog with a scannable code of
the room's address. It moved from the light lane to the full lane after review. The design
is drawn in `docs/design/room.html?qr=1`.

## Terms

- **Light dismiss**: the browser closing a `<dialog closedby="any">` when a press and its
  release both land outside the dialog's box. It fires a cancelable `cancel` event first.
- **Room link**: `window.location.origin + '/' + roomId`, what Copy link copies.
- **Inert**: while the dialog is open as a modal, nothing outside it takes a press, a key
  or focus.

## Decisions

1. **Encoder.** `lean-qr` 2.7.4: MIT, own types, no dependencies, 4.2 kB gzipped for link
   to SVG, against `qr` 0.7.2 at 6.6 kB and `qrcode-generator` 2.0.4 at 7.4 kB (each
   bundled by rolldown, minified). It goes in the root `package.json`'s dependencies.
2. **Drawing.** The modules are one SVG path, black on white, in a 4-module quiet zone, an
   `<svg role="img" aria-label="QR code of the room link">` as the mockup draws. The code
   is computed in render: about a millisecond, and the room id never changes on a page.
3. **The dialog.** `RoomQrDialog.tsx` and `room-qr-dialog.css` draw a native
   `<dialog closedby="any">`, mounted in the header as a sibling of ☰ and its row, with the
   mockup's content: heading "Scan to join", the code, the room id (`--text-3xl`, J7's
   shared-screen text; `--text-xl` on phone), the room link as selectable text, and Close.
   It holds no React state: `RoomHeader` keeps a ref, and the browser keeps open or closed.
   The dialog's own `display` is left to the browser, as Next issue's is, so it hides when
   closed: the content is block flow, centred by `text-align` with the code's
   `margin-inline: auto`, each item after the first `margin-top: var(--space-3)`, the
   mockup's gap. The code's size follows the mockup's `.qr-code` rule, which also subtracts
   the panel's two borders (`2 * var(--line-hairline)`) from both terms: without them the
   code is 2 px wider than its box at 320 px. `--qr-reserved` keeps the mockup's 15 rem,
   12 rem below 51.75 rem, moved into `room-qr-dialog.css`. The dialog's `max-width` and
   `max-height` are `calc(100% - 2 * var(--space-4))`, matching the rule's `2 * --space-4`
   term, which the mockup gets from `.next-backdrop`'s padding instead (the browser's cap
   leaves 6 px less, and `max-width: none` with no width reaches both edges, measured at
   320 px). A short viewport scrolls it: the browser's modal style gives `overflow: auto`. `::backdrop` follows
   `next-issue-dialog.css`.
4. **The button.** In the room id's chip after Copy link, with Copy link's class and look:
   lucide's `QrCode` icon, the word "QR code" on desktop, the icon alone on phone, and
   `aria-label="QR code"` as Copy link has. On phone the chip's gap is 12 px so the two
   44 px targets do not overlap. Nothing joins the ☰ row.
5. **Opening and focus.** A press calls `showModal()`, then focuses Close, as `useNextIssue`'s
   opening focuses its field. On close, Chromium and Firefox return focus to the button.
   The dialog spreads `pressRules`, as Next issue's does: a held Enter's repeats are
   dropped, so they cannot press Close and then QR code again in turn. Its mouse rules act
   only on a button, here Close alone, so a double-click still selects the link.
6. **Closing.** Close calls `close()`; Escape and light dismiss are the browser's. Safari
   lacks `closedby` until 27.3.
7. **A double-click on the button** opens the dialog, and its second press, landing on the
   backdrop, light-dismisses it again. Accepted: a guard would add a ref, two handlers and
   an Escape edge case.
8. **The ☰ row** stays as it was when the dialog opens, as it does for Copy link.
9. **One `roomLink(roomId)`** in `RoomHeader` serves the code, the shown link and `copy`.
10. **Contract.** "Contract reads the look keeps" in `ui-reference.md` reads the button
    "QR code" and the dialog "Scan to join".

## States × events

| Event | Closed | Open |
|---|---|---|
| Press QR code | opens, focuses Close (decision 5) | cannot happen: inert |
| Double-click QR code | opens, then closes (decision 7) | cannot happen: inert |
| Held Enter on QR code | opens once; repeats dropped (decision 5) | cannot happen: inert |
| Close | cannot happen: hidden | closes |
| Escape | the page's own (☰ row rules unchanged) | closes; reaches the dialog only |
| Click outside | the page's own | closes (decision 6) |
| Press inside, release outside | cannot happen: hidden | stays open |
| Click in the padding or content | cannot happen: hidden | stays open |
| Copy within 2 s before opening | — | the hint clears behind the backdrop |
| ☰ row open when opening | opens; the row stays (decision 8) | cannot happen: inert |
| Snapshot update, banner, role switch in another tab | — | header redraws; the dialog stays |
| Server restart (`?restarted=1` reload) | page reloads | page reloads, dialog gone |
| Scripted focus: IssuePanel's `box` and `edit`, RoundBar's `refocus`, Banners' `dismiss` | — | target inert, focus stays (inferred) |
| Viewport crosses 51.75 rem | — | same element, resized |
| Room id changes | cannot happen: `pathRoom` is read once per page | cannot happen |
| Next issue or Leave pressed | — | cannot happen: inert |
| RoomPage unmounts | cannot happen once the room is reached | cannot happen |

Every close returns focus as decision 5 says.

## Spike

A static page driven by Playwright 1.64 in Chromium and Firefox showed: a padding click,
and a drag from the content out or from outside in, keep a `<dialog closedby="any">` open;
a click outside and Escape close it and return focus; a short modal dialog scrolls with
no author `overflow`; a double-click on the opener closes
it again; a held Enter toggles it, and `pressRules`' keydown rule stops that; an author
`display` on a closed `<dialog>` shows it; at 320 px a dialog with `max-width: none` and
no width spans the viewport.

## Accepted costs

- Decision 6's Safari gap: there a click outside does nothing, and Close serves.
- Decision 7's double-click flash.
- Safari's focus return is untested: a pointer user's focus was never on the button, and
  a keyboard user's return is assumed.
- On a short viewport, such as a phone on its side, the dialog scrolls.
- A banner's live region may go unannounced while the modal is open (inferred).

## Tests

New `e2e/qr.spec.js`, Chromium and Firefox:

- At 1280 × 800 the dialog is hidden before the press. After it, the code's element
  screenshot, drawn on a canvas in the page, decodes with `jsqr` 1.4.0 (a dev dependency,
  its UMD build by `addScriptTag`) to `page.url()`; the dialog's link text equals it too.
- Close, Escape and a click on the backdrop each close it: Close is focused after each
  opening, and QR code after each closing.
- Enter held on QR code for exactly one repeat leaves it open, Close focused (unguarded,
  that one repeat presses Close).
- While Alice's dialog is open, Bob votes; it stays open with its code.
- At 320 × 568 (the test server's short link), the button, found by role and name, opens
  it; it scrolls on neither axis and sits 16 px (±0.5) from the left and right edges.
  Resized to 568 × 320, it sits 16 px from top and bottom, and setting its `scrollTop`
  moves it.
- `layout.spec.js`'s 320 px case adds QR code to the boxes the shown copy hint must not cover.

Light dismiss's drag and padding behaviour is the browser's, proven by the spike, not
tested here. Each case is proven to fail by mutation: the encoded link, the shown link,
`closedby`, the `aria-label`, the focus on Close, the `pressRules` spread, a `display` on
the dialog, `max-width: none`, `max-height`, the borders in the code's rule, and a key that changes with the snapshot.

## Documents

`ui-reference.md`'s contract section (decision 10). The mockup is settled for this step:
it already draws the dialog, the button with its `aria-label`, and the ☰ row left open.
