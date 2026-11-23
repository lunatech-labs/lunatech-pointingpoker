# Change note: Copy link as a button

**Lane:** light. Step 1 of #579; the QR code button (step 2) joins Copy link in the room id's chip.

**Problem.** Copy link is an `<a href="#">` whose click runs a script, so a screen reader
announces a link, and it carries the browser's default link underline, which
`room-header.css` never chose. J4's underline is for links; of Copy link it sets only the
colour. The QR code button beside it in the chip must read and look the same.

**Acceptance.** Copy link is a button named "Copy link", with no underline; a click
copies the link and shows "Link copied" as today; its box, on phone and desktop, is unchanged.

**Decision.** `RoomHeader` draws `<button type="button" class="room-header-copy">`, and
`copy` drops its event and `preventDefault`; the CSS is untouched. `room.html` draws the
same, and the "Contract reads the look keeps" section of `ui-reference.md` reads Copy link
"as a button by that name". Leave stays a link: `connection.leave()` assigns `/`.

**Tests.** The Copy link locators in `narrow.spec.js`, `room.spec.js` and `layout.spec.js`
move to `getByRole('button', { name: 'Copy link' })`; restoring the `<a>` turns them red,
which proves the role. No case asserts the missing underline: only an `<a>` draws one, and
the e2e suite asserts no control's decoration. Copy link's box, read once with a fixed
room id at 1280, 800, 392 and 320 px wide in Chromium and Firefox, is the same on main and
the branch.

**Review:** one wave, 3 lenses (Sonnet). Failure modes 2 material (the box and the
underline unchecked, accepted as one gap: a one-off measurement, no underline case),
simplicity 0, consistency 3 material (the box and the phone form, folded into that gap;
Leave's reason, rejected: it navigates); wording accepted.
