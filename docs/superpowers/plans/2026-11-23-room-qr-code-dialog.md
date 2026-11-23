# Room QR Code Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "QR code" button beside Copy link opens a dialog with a scannable code of the room link.

**Architecture:** `RoomQrDialog` draws a native `<dialog closedby="any">` with no React state; `RoomHeader` keeps its ref, opens it, and passes it the one room link that Copy link also copies. `lean-qr` encodes the link in render into one SVG path. The dialog's CSS sizes the code to the height the text leaves, down to an 8 rem floor.

**Tech Stack:** React 19 + TypeScript (Vite), `lean-qr`, Playwright e2e in Chromium and Firefox, `jsqr` to decode in tests.

**Spec:** `docs/superpowers/specs/2026-11-23-room-qr-code-dialog-design.md`

## Global Constraints

- Encoder `lean-qr` 2.7.4 in the root `package.json`'s dependencies; `jsqr` 1.4.0 in its devDependencies; caret ranges, as the file's others.
- `generate(link, { minCorrectionLevel: correction.M })`, drawn as one black path on a white `<rect>` spanning the 4-module quiet zone (decision 2).
- Copy, exactly: button "QR code" (`aria-label="QR code"`), heading "Scan to join", image name "QR code of the room link", button "Close".
- The design is `docs/design/room.html?qr=1`: copy its `.qr-*` rules, not its `<section>` in a backdrop, its `.qr-dialog` width, `max-height`, `overflow` or unconditional `display` (spec, Documents). If the app does not look as the mockup draws it, stop and report.
- Every e2e case runs in both browsers.
- Code comments are one or two lines.
- Every new or changed test is proven able to fail: break the mechanism it names, see it red, revert, then `npm run build` before any manual run.
- Conventional Commits; no Claude Code attribution line.

## Rulings

Choices the spec left to the plan, each with its simpler alternative where one exists.

1. **One ref, the opener in `RoomHeader`.** `RoomHeader` holds `qrDialog = useRef<HTMLDialogElement>(null)` and passes it as `dialogRef`, as `NextIssueDialog` attaches a ref made in `useNextIssue`. The press handler calls `showModal()`, then sets `scrollTop = 0` (decision 5). Alternative: the dialog owns its opener through `useImperativeHandle`. Rejected: no precedent in the codebase, and a handle for three lines.
2. **`roomLink` is a module function** in `RoomHeader.tsx`, `const roomLink = (roomId: string) => window.location.origin + '/' + roomId`; the render computes `link` once, and passes it to `copy` and the dialog. Alternative: an inline `const link` in render; rejected because decision 9 names `roomLink(roomId)`.
3. **The code is generated on every render**, without `useMemo`: about 1 ms per header render, which follows each snapshot, and snapshots come at the pace of people's presses. Alternative: `useMemo` keyed on `link`, which saves nothing a person could notice.
4. **No backdrop `onMouseDown` guard**, unlike `NextIssueDialog`'s: decision 5 names `pressRules` only, and nothing in this dialog holds typed state for a stray press to disturb.
5. **Class names are the mockup's**: `panel qr-dialog`, `qr-code`, `qr-room`, `qr-link`; Close is `button button-secondary`, word only, as drawn. The button takes `room-header-copy` alone: the mockup's `.room-header-qr` rule supplies what `page.css` already gives every button.
6. **The phone chip's 12 px gap is unconditional**, `gap: var(--space-3)` on `.room-header-chip` in `room-header.css`'s `width < 51.75rem` block: the app always has both buttons, so the mockup's `:has(.room-header-qr)` guard is the mockup's alone.
7. **Decoding in the page**: `decode(page)` takes the code's element screenshot, loads it as a `data:image/png` image onto a canvas, and returns `jsQR(data, width, height)?.data`, with `jsQR` added by `page.addScriptTag({ path })` and `path` from `createRequire(import.meta.url).resolve('jsqr')`. The app sets no CSP that would block the `data:` image.
8. **A backdrop click** is `page.mouse.click(5, 5)`, the viewport's corner, outside the centred 46 rem dialog at 1280 px.

## Review Focus

Inputs the spec implies that no task's tests exercise. As in earlier plans under the lean test budget, these are flagged for the user rather than given tests:

1. The phone chip's 12 px gap (decision 4): Copy link's and QR code's 44 px targets should not overlap. Nothing measures it; a dropped gap would pass every case.
2. Selecting the link by double-click inside the dialog should select it whole (`user-select: all`), with `pressRules` acting on Close only (decision 5).
3. Forced colours (decision 2): the code should stay black on white. Unchecked in emulation.
4. A banner arriving while the dialog is open (states × events) should show behind the backdrop and leave the dialog open; only a snapshot update is tested.
5. The room id at its longest, 26 characters, should stay on one line on desktop (decision 3); the 1280 case uses whatever slug the test server makes.
6. The room id's size step (decision 3, amended after the final review): `--text-3xl` while the dialog's content is at least 43 rem wide, `--text-xl` below; no case reads the id's size.

---

### Task 1: The dialog and its button, on desktop

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `frontend/src/components/RoomQrDialog.tsx`, `frontend/src/components/room-qr-dialog.css`
- Modify: `frontend/src/components/RoomHeader.tsx`
- Test: `e2e/qr.spec.js`

**Interfaces:**
- Produces: `RoomQrDialog({ roomId, link, dialogRef }: { roomId: string; link: string; dialogRef: RefObject<HTMLDialogElement | null> })`; in `e2e/qr.spec.js`, `qrButton(page)`, `qrDialog(page)` (`getByRole('dialog', { name: 'Scan to join' })`), `qrCode(page)` (the image inside it), `closeButton(page)`, `decode(page)`.

- [ ] **Step 1: Add the dependencies.** `npm install lean-qr@^2.7.4` and `npm install -D jsqr@^1.4.0` at the repo root. Expected: both in `package.json` and the lock, `npm run typecheck` still clean.
- [ ] **Step 2: Write `e2e/qr.spec.js`** with `test.use({ viewport: { width: 1280, height: 600 } })`, the Interfaces helpers, ruling 7's `decode`, and these cases, each from `join('Alice')`:
  - `the dialog fits a laptop and its code scans to the room`: dialog hidden; press QR code; `qrDialog`'s `scrollHeight <= clientHeight` and `scrollWidth <= clientWidth`; its box width within 0.5 of 46 × the root's computed font size; `decode(page)` equals `page.url()`; `qrDialog(page).getByText(page.url(), { exact: true })` visible.
  - `Close, Escape and the backdrop each close it`: for each closer (Close's click, `Escape`, ruling 8's click): press QR code, `closeButton` focused; close; dialog hidden, `qrButton` focused.
  - `a held Enter opens it once`: focus `qrButton`, `keyboard.down('Enter')` twice, `keyboard.up('Enter')`, as `roles.spec.js`'s held-Enter case; dialog visible, Close focused.
  - `a vote while open leaves it open`: `voters(['Bob'])` before opening; open; `bob.vote('5')`; `votedMark(participantEntry(page, 'Bob'))` has count 1; dialog visible and `qrCode` visible.

  Run `npm run e2e -- e2e/qr.spec.js`: expected FAIL, no button named "QR code".
- [ ] **Step 3: Write `RoomQrDialog` and `room-qr-dialog.css`** per decisions 2, 3 and 6 and rulings 4 and 5: the dialog spreads `pressRules`, is `aria-labelledby` its `h2` through `useId`, and Close calls `close()`. The SVG's `viewBox` and `<rect>` are `-4 -4 (size + 8) (size + 8)`, its path `toSvgPath(code)` from `lean-qr/extras/svg`. CSS: decision 3's width, `max-width: none`, `[open]` flex column, and the code's `flex-shrink: 1`, `width: 100%`, `height: auto`, `aspect-ratio: 1`, `shape-rendering: crispEdges`; the `::backdrop` as `next-issue-dialog.css`'s. Leave `min-height: 8rem` and the scroll reset to Task 2.
- [ ] **Step 4: Wire `RoomHeader`** per ruling 1 without the scroll reset, rulings 2 and 5, and decision 4: lucide's `QrCode` icon and `<span className="room-header-copy-word">QR code</span>` after Copy link in the chip; `<RoomQrDialog>` after the ☰ row. Run the spec: PASS in both browsers.
- [ ] **Step 5: Prove each case can fail**, one mutation at a time, reverting each: the link given to `generate` and the shown link, each with `'x'` appended (the scan case); `closedby` dropped, and `tabIndex={0}` on the heading (the closing case); `width: 46rem` changed to `40rem`, and `flex-shrink: 1` dropped (the scan case's fit); `[open]` dropped from the `display` rule (hidden before the press); the `pressRules` spread dropped (held Enter); `key={JSON.stringify(view)}` on `RoomPage`'s `<RoomHeader>` (the vote case). Then `npm run build`.
- [ ] **Step 6: Check and commit.** `npm run typecheck`, `npm run lint`, `npm run test:unit` clean. Commit `feat: show the room link as a QR code`.

### Task 2: Phone and short viewports, and the contract

**Files:**
- Modify: `frontend/src/components/RoomHeader.tsx`, `frontend/src/components/room-qr-dialog.css`, `frontend/src/components/room-header.css`
- Modify: `e2e/qr.spec.js`, `e2e/layout.spec.js` (its 320 px copy case, in the viewport sizes loop), `docs/design/ui-reference.md` ("Contract reads the look keeps")

**Interfaces:**
- Consumes: Task 1's helpers in `e2e/qr.spec.js`.

- [ ] **Step 1: Add the case** `a phone opens it at the edges, a short viewport at its floor`: `setViewportSize({ width: 320, height: 568 })`; open by `qrButton`; dialog scrolls on neither axis; its box's `x` and `320 - (x + width)` each within 0.5 of 16. Press Escape, `setViewportSize({ width: 568, height: 320 })`, open again: `qrCode`'s box height within 0.5 of 8 × the root's font size, the dialog's `scrollTop` 0, Close focused. Run: expected FAIL on the code's height.
- [ ] **Step 2: Add the floor and the reset**: `min-height: 8rem` on `.qr-code`, `scrollTop = 0` after `showModal()` (ruling 1), and ruling 6's gap. Run `npm run e2e -- e2e/qr.spec.js`: PASS.
- [ ] **Step 3: Extend `layout.spec.js`'s 320 px copy case**: add `qr: page.getByRole('button', { name: 'QR code' })` to `named`, and `'qr'` to the names the hint's text must not cover; the `kept` message names QR code. Run `npm run e2e -- e2e/layout.spec.js`: PASS. If the hint covers QR code, stop and report: it is a design finding.
- [ ] **Step 4: Prove the new reads can fail**, reverting each: `aria-label` dropped from QR code, and the dialog's `width` rule dropped (the 320 case); `min-height` dropped, and the `scrollTop` reset dropped (568 × 320); `order: -1` on QR code, putting it where the hint shows (the layout case's cover check). Then `npm run build`.
- [ ] **Step 5: Add the contract bullet** after the copy hint's in "Contract reads the look keeps" (decision 10): QR code read as a button by that name, the dialog by its role and name "Scan to join", and the code as the image "QR code of the room link".
- [ ] **Step 6: Run the whole suite and commit.** `npm run e2e`: all green in both browsers (the header changed for every layout case). Commit `feat: fit the QR code dialog to phones and short screens`.
