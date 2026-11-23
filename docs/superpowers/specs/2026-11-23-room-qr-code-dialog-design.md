# Room QR Code Dialog

Date: 2026-11-23
Status: Approved
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

1. **Encoder.** `lean-qr` 2.7.4. The three candidates are all MIT, typed and free of
   dependencies; `lean-qr` is the smallest, 4.2 kB gzipped for link to SVG, against `qr`
   0.7.2 at 6.6 kB and `qrcode-generator` 2.0.4 at 7.4 kB (each bundled by rolldown,
   minified). It alone splits a link into its cheapest modes and returns the path outline
   (`toSvgPath`), and at level M its code for a production link is bit-identical to
   `qr`'s, which is tested against reference vectors. `qrcode-generator` has had no
   release since August 2025 and chooses its mask off the standard's penalty. `lean-qr`
   goes in the root `package.json`'s dependencies.
2. **Drawing.** The modules are one SVG path, black on a white `<rect>` that spans the
   4-module quiet zone: it keeps its fill under forced colours, where Firefox replaces a
   CSS background, and stays inside the square when the box is wider. An
   `<svg role="img" aria-label="QR code of the room link">` as the mockup draws. The code
   is computed in render: about a millisecond, and the room id never changes on a page. It
   is generated with `minCorrectionLevel: correction.M`: `lean-qr` takes the smallest
   version that holds the link at M, then the highest level that version fits. Its own
   floor, L, would leave some links at L, such as a 49-character test link or a production
   link of 63 characters or more: about 7% of the code recoverable against a screen's
   glare, against M's 15%.
3. **The dialog.** `RoomQrDialog.tsx` and `room-qr-dialog.css` draw a native
   `<dialog closedby="any">`, mounted in the header as a sibling of ☰ and its row, with
   the mockup's content: heading "Scan to join", the code, the room id (`--text-3xl`, J7's
   shared-screen text; `--text-xl` on phone), the room link as selectable text, and Close.
   It holds no React state: `RoomHeader` keeps a ref, and the browser keeps open or
   closed. Its width does not depend on its height:
   `width: min(46rem, 100% - 2 * var(--space-4))` with `max-width: none`, as Next issue's,
   keeps the longest room id (26 characters) on one line on desktop. Open, it is a centred
   column, `gap: var(--space-3)`, the mockup's; the `display: flex` is on `[open]` only,
   so a closed dialog keeps the browser's `none`. The code is `width: 100%` with
   `aspect-ratio: 1`, and shrinks to the height the rest leaves under the browser's modal
   cap, so wrapped text shrinks the code instead of scrolling the dialog: `flex-shrink: 1`
   and `height: auto` override `page.css`'s icon rule (`flex: none`,
   `height: var(--icon)`). `min-height: 8rem` keeps the code scannable: below it the modal
   cap scrolls the dialog. A code shorter than its box's width is drawn centred in it, the
   SVG's default fit. `::backdrop` follows `next-issue-dialog.css`.
4. **The button.** In the room id's chip after Copy link, with Copy link's class and look:
   lucide's `QrCode` icon, the word "QR code" on desktop, the icon alone on phone, and
   `aria-label="QR code"` as Copy link has. On phone the chip's gap is 12 px so the two
   44 px targets do not overlap. Nothing joins the ☰ row.
5. **Opening and focus.** A press calls `showModal()`, which focuses Close, the dialog's
   only focusable element, then sets the dialog's `scrollTop` to 0:
   `showModal()` scrolls to Close, which on a viewport below the code's floor hides the
   code's top. On close, Chromium and Firefox return focus to the button. The dialog
   spreads `pressRules`, as Next issue's does: a held Enter's repeats are dropped, so they
   cannot press Close and then QR code again in turn. Its mouse rules act only on a
   button, here Close alone, so a double-click still selects the link.
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
`display` on a closed `<dialog>` shows it, and one on `[open]` does not. `showModal()`,
by click or Enter, focuses Close, its only focusable element, and a scrolling dialog opens
scrolled to it; `focus({ preventScroll: true })`
cannot undo that, and `scrollTop = 0` does. A dialog laid out
as decision 3 says, with the longest room id, scrolls at none of 1280 × 600, 1280 × 630,
1920 × 1080 and 320 × 568. The mockup, with an 18- and a 26-character id, also keeps the id
on one line at 1472 × 704 and 2944 × 1493, and scrolls only at 568 × 320. The rejected
first sizing, its width taken from the viewport's height less an estimate of the text's,
scrolled at 1280 × 600 and 1280 × 630, and at 1920 × 1080 with the longest id.

## Accepted costs

- Decision 6's Safari gap: there a click outside does nothing, and Close serves.
- Decision 7's double-click flash.
- Safari's focus return is untested: a pointer user's focus was never on the button, and
  a keyboard user's return is assumed.
- On a viewport too short for the code's floor, such as a phone on its side or a laptop
  at 200% zoom, or with very large text, the dialog scrolls.
- On a short desktop the code is narrower than the dialog: in the mockup at 1280 × 600, a
  340 px code in a 736 px (46 rem) dialog.
- A banner's live region may go unannounced while the modal is open (inferred).

## Tests

New `e2e/qr.spec.js`, Chromium and Firefox:

- At 1280 × 600, the laptop floor (narrow-cases spec, decision 3), the dialog is hidden
  before the press, and fits unscrolled after it, 46 rem wide. The
  code's element screenshot, drawn on a canvas in the page, decodes with `jsqr` 1.4.0 (a
  dev dependency, its UMD build by `addScriptTag`) to `page.url()`; the dialog's link text
  equals it too.
- Close, Escape and a click on the backdrop each close it: Close is focused after each
  opening, and QR code after each closing.
- Enter held on QR code for exactly one repeat leaves it open, Close focused (unguarded,
  that one repeat presses Close).
- While Alice's dialog is open, Bob votes; it stays open with its code.
- At 320 × 568 (the test server's short link), the button, found by role and name, opens
  it; it scrolls on neither axis and sits 16 px (±0.5) from the left and right edges.
  Reopened at 568 × 320, the code is 8 rem tall, the floor, and the dialog is scrolled to
  the top with Close focused.
- `layout.spec.js`'s 320 px case adds QR code to the boxes the shown copy hint must not cover.

Light dismiss's drag and padding behaviour is the browser's, proven by the spike, not
tested here. Nor is decision 2's level: a clean screenshot decodes at any level. Each case
is proven to fail by mutation: the encoded link and the shown link (the decode),
`closedby` and a heading made focusable before Close (the closing case), the `aria-label` and the dialog's
`width` dropped (the 320 case), its 46 rem changed and the code's `flex-shrink: 1` dropped
(1280 fit), the floor and the scroll reset each dropped (568 × 320), the `[open]` dropped
from the `display` (hidden before the press), the `pressRules` spread (held Enter), and a
key that changes with the snapshot (Bob's vote).

## Documents

`ui-reference.md`'s contract section (decision 10). The mockup is settled for this step:
it draws the dialog sized as decision 3 says (its `<section>` in a padded backdrop, with
`max-height: 100%`, `overflow: auto` and an unconditional `display: flex`, stands in for
the native dialog's gutters, modal cap and `[open]` rule, and is not to be copied), the
button with its `aria-label`, and the ☰ row left open.
