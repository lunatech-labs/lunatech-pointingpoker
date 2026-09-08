import {
  test,
  expect,
  connectionAlert,
  connectionLost,
  participantRow,
  participantRows,
  revealedCell,
  summaryTable,
  issueBox,
  issueButton,
  votedMark,
  hiddenMark,
  vote
} from './fixtures.js'

test('two browsers exchange votes', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  await expect(participantRow(alice.page, 'Bob')).toHaveCount(1)

  await vote(alice.page, '5')
  const aliceOnBob = participantRow(bob.page, 'Alice')
  await expect(votedMark(aliceOnBob)).toHaveCount(1)
  // The vote is marked but the value is withheld until the round is revealed.
  await expect(aliceOnBob).not.toContainText('5')

  await vote(bob.page, '3')
  // Everyone having voted reveals the round with nobody pressing Show.
  for (const participant of [alice, bob]) {
    await expect(summaryTable(participant.page)).toBeVisible()
    await expect(participantRow(participant.page, 'Alice')).toContainText('5')
    await expect(participantRow(participant.page, 'Bob')).toContainText('3')
  }
})

test('a straggler keeps the votes hidden until Show is pressed', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await vote(alice.page, '5')
  await expect(votedMark(participantRow(bob.page, 'Alice'))).toHaveCount(1)
  await expect(summaryTable(bob.page)).toBeHidden()

  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await expect(summaryTable(bob.page)).toBeVisible()
  await expect(participantRow(bob.page, 'Alice')).toContainText('5')
})

test('a cast vote shows as withheld in the other browser until the reveal', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await vote(alice.page, '5')
  const aliceOnBob = participantRow(bob.page, 'Alice')
  await expect(votedMark(aliceOnBob)).toHaveCount(1)
  // Redaction blanks the estimation, so this marker can only come from hasEstimation.
  await expect(hiddenMark(aliceOnBob)).toHaveCount(1)
  await expect(aliceOnBob).not.toContainText('5')

  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await expect(aliceOnBob).toContainText('5')
  await expect(hiddenMark(aliceOnBob)).toHaveCount(0)
})

test('the participant list follows a join and a leave', async ({ join }) => {
  const alice = await join('Alice')
  await expect(participantRows(alice.page)).toHaveCount(1)

  const bob = await join('Bob')
  await expect(participantRows(alice.page)).toHaveCount(2)
  await expect(participantRows(bob.page)).toHaveCount(2)

  await bob.page.getByRole('link', { name: 'Leave' }).click()
  // The app notices a dead stream only when a write to it fails, and the first write after a
  // close only draws the reset, so two broadcasts stand in for the heartbeat 15s away.
  const clear = alice.page.getByRole('button', { name: 'Clear votes' })
  await clear.click()
  await clear.click()

  // 25s, not 20s: if detection ever falls back to the 15s heartbeat the removal lands at about
  // 20.1s, just outside the tighter cap, and this case has no cut whose budget a wait spends.
  await expect(participantRow(alice.page, 'Bob')).toHaveCount(0, { timeout: 25_000 })
  await expect(participantRows(alice.page)).toHaveCount(1)
})

test('the issue box is readonly until the pencil is pressed', async ({ join }) => {
  const alice = await join('Alice')

  await expect(issueBox(alice.page)).toHaveJSProperty('readOnly', true)
  await issueButton(alice.page).click()
  await expect(issueBox(alice.page)).toHaveJSProperty('readOnly', false)
})

// Carol departs while Bob is cut, and Bob is back before his own removal fires. Shared so the
// green control below cannot drift from the case it exists to control.
async function departureWhileCut(join) {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const carol = await join('Carol')
  // Both, and not just one: Bob must have seen Carol for the case to mean anything, and Alice
  // must have too or her removal assertion below passes on someone she never had.
  await expect(participantRows(bob.page)).toHaveCount(3)
  await expect(participantRows(alice.page)).toHaveCount(3)

  await carol.close()
  // Two broadcasts are what make the app notice Carol, and both must be seen reaching Bob
  // before he is cut, or his own removal starts on the same clock as Carol's.
  const aliceOnBob = participantRow(bob.page, 'Alice')
  await vote(alice.page, '5')
  await expect(votedMark(aliceOnBob)).toHaveCount(1)
  await alice.page.getByRole('button', { name: 'Clear votes' }).click()
  await expect(votedMark(aliceOnBob)).toHaveCount(0)

  await bob.cut()
  await expect(connectionLost(bob.page)).toBeVisible()

  await expect(participantRow(alice.page, 'Carol')).toHaveCount(0, { timeout: 20_000 })
  await bob.restore()
  await expect(connectionAlert(bob.page)).toBeHidden({ timeout: 10_000 })
  return { alice, bob }
}

test('a cut stream reconnects and the room survives it', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await bob.cut()
  await expect(connectionLost(bob.page)).toBeVisible()
  await bob.restore()
  // The banner clears on reopen, so its absence is the reconnect, retryable rather than timed.
  await expect(connectionAlert(bob.page)).toBeHidden({ timeout: 10_000 })

  // A vote landing on Bob's page proves his stream came back usable: the banner clearing above
  // is only onopen firing, and says nothing about whether frames still arrive.
  await vote(alice.page, '5')
  await expect(votedMark(participantRow(bob.page, 'Alice').first())).toHaveCount(1, {
    timeout: 10_000
  })
})

test('a departure is announced while another participant is cut', async ({ join }) => {
  await departureWhileCut(join)
})

test('a Show survives someone joining', async ({ join }) => {
  const alice = await join('Alice')
  await join('Bob')

  await vote(alice.page, '5')
  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await expect(summaryTable(alice.page)).toBeVisible()

  await join('Carol')
  // Carol's row proves the join was processed, and the un-reveal happens in the same handler.
  await expect(participantRow(alice.page, 'Carol')).toHaveCount(1)
  await expect(summaryTable(alice.page)).toBeVisible({ timeout: 2000 })
})

test('an auto-revealed round stays revealed when a straggler arrives', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await vote(alice.page, '5')
  await vote(bob.page, '3')
  await expect(summaryTable(alice.page)).toBeVisible()

  await join('Carol')
  await expect(participantRow(alice.page, 'Carol')).toHaveCount(1)
  await expect(summaryTable(alice.page)).toBeVisible({ timeout: 2000 })
})

// Carol never votes and then leaves, which a re-derived everyone-has-voted predicate would
// answer by revealing the room. Shared so the two departure modes cannot drift apart.
async function stragglerDepartsWithVotesHidden(join, depart, prunedRoster) {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const carol = await join('Carol')
  // Everyone must have seen all three, or the removal assertion below passes on a row that
  // was never rendered.
  for (const page of [alice.page, bob.page]) {
    await expect(participantRows(page)).toHaveCount(3)
  }

  await vote(alice.page, '5')
  await vote(bob.page, '3')
  await expect(summaryTable(alice.page)).toBeHidden()

  await depart(carol, alice)

  // Two commits stand in for the heartbeat 15s away: a dead stream shows only on a failed
  // write. Edits, not votes, since a vote after the prune could reveal the round legitimately.
  for (const issue of ['PP-1', 'PP-2']) {
    await issueButton(alice.page).click()
    await issueBox(alice.page).fill(issue)
    await issueButton(alice.page).click()
    // Bob's box is the proof the publish went out, and therefore that Carol was written to.
    await expect(issueBox(bob.page)).toHaveValue(issue)
  }

  // What the pruned roster looks like differs by departure mode, so each case brings its own.
  await prunedRoster(alice)

  // Both remaining members have voted, reached by a departure rather than by a vote, so the
  // latch must leave the room hidden.
  for (const page of [alice.page, bob.page]) {
    await expect(summaryTable(page)).toBeHidden()
  }
  await expect(participantRow(alice.page, 'Bob')).not.toContainText('3')
  await expect(participantRow(bob.page, 'Alice')).not.toContainText('5')
  await expect(hiddenMark(participantRow(alice.page, 'Bob'))).toHaveCount(1)
}

test('a straggler closing their tab leaves the votes hidden', async ({ join }) => {
  await stragglerDepartsWithVotesHidden(
    join,
    carol => carol.close(),
    // 25s for the reason the leave case above records: if detection ever falls back to the
    // 15s heartbeat the removal lands at about 20.1s, just outside a tighter cap.
    alice => expect(participantRow(alice.page, 'Carol')).toHaveCount(0, { timeout: 25_000 })
  )
})

test('a straggler reloading leaves the votes hidden', async ({ join }) => {
  // Vacuous for the latch today: a non-voting Carol remains, so no re-derived predicate would
  // fire. Kept for step 6, where a beacon removes her instead of replacing her.
  await stragglerDepartsWithVotesHidden(
    join,
    // created() rejoins from localStorage, so a reload is a departure plus an immediate new
    // participant and /join mints a second id: Carol is listed twice until the prune.
    async (carol, alice) => {
      await carol.page.reload()
      await expect(participantRow(alice.page, 'Carol')).toHaveCount(2)
    },
    // Step 6's idempotent join removes the duplicate, so this count becomes 1 throughout and
    // this expectation is one the step has to revisit.
    alice => expect(participantRow(alice.page, 'Carol')).toHaveCount(1, { timeout: 25_000 })
  )
})

test('the tally counts only the votes that were cast', async ({ join }) => {
  const alice = await join('Alice')
  await join('Bob')

  await vote(alice.page, '5')
  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await expect(summaryTable(alice.page)).toBeVisible()

  // Before step 3 Bob's empty estimation was a row of its own, and could out-count a real one.
  await expect(summaryTable(alice.page).locator('tbody tr')).toHaveCount(1, { timeout: 2000 })
})

test('a Show in a room where nobody voted renders no summary', async ({ join }) => {
  const alice = await join('Alice')
  await join('Bob')

  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  // The reveal has to be shown to have landed, or the assertion below passes on a snapshot
  // that never arrived. An empty tally under a votesRevealed-only condition is a render error.
  await expect(revealedCell(participantRow(alice.page, 'Bob'))).toHaveCount(1)
  await expect(summaryTable(alice.page)).toBeHidden()

  // The block still renders once there is something to tally, so the guard is not a dead end.
  await vote(alice.page, '5')
  await expect(summaryTable(alice.page)).toBeVisible()
  await expect(summaryTable(alice.page).locator('tbody tr')).toHaveCount(1)
})

test('no duplicate participants after a reconnect', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await bob.cut()
  await expect(connectionLost(bob.page)).toBeVisible()
  await bob.restore()
  await expect(connectionAlert(bob.page)).toBeHidden({ timeout: 10_000 })

  await vote(alice.page, '5')
  await expect(votedMark(participantRow(bob.page, 'Alice').first())).toHaveCount(1, {
    timeout: 10_000
  })

  await expect(participantRows(bob.page)).toHaveCount(2, { timeout: 2000 })
  await expect(participantRows(alice.page)).toHaveCount(2, { timeout: 2000 })
})

test('a participant who departed during the gap is pruned on reconnect', async ({ join }) => {
  const { bob } = await departureWhileCut(join)

  await expect(participantRow(bob.page, 'Carol')).toHaveCount(0, { timeout: 2000 })
})

test('a vote survives its own reconnect', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await vote(bob.page, '8')
  await expect(votedMark(participantRow(alice.page, 'Bob'))).toHaveCount(1)

  await bob.cut()
  await expect(connectionLost(bob.page)).toBeVisible()
  await bob.restore()
  await expect(connectionAlert(bob.page)).toBeHidden({ timeout: 10_000 })

  // The room's own state, not Bob's stale copy: Alice never disconnected, so her row for
  // Bob is redrawn from a snapshot published after the reconnect.
  await vote(alice.page, '5')
  await expect(votedMark(participantRow(alice.page, 'Bob'))).toHaveCount(1, { timeout: 10_000 })
  await expect(participantRow(alice.page, 'Bob')).toContainText('8')
})

test('the issue box resyncs once the editor loses focus', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await issueButton(alice.page).click()
  await issueBox(alice.page).fill('Alice is still typing')

  // Any publish carries the issue, so a vote by anyone would clobber an unguarded box.
  await vote(bob.page, '5')
  // Require the snapshot to have landed: toHaveValue passes on its first poll otherwise.
  await expect(votedMark(participantRow(alice.page, 'Bob'))).toHaveCount(1)
  await expect(issueBox(alice.page)).toHaveValue('Alice is still typing')

  await issueBox(alice.page).blur()
  await vote(bob.page, '3')
  await expect(issueBox(alice.page)).toHaveValue('')
})

test('an edit committed with the check button reaches the other browser', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await issueButton(alice.page).click()
  await issueBox(alice.page).fill('PP-42')
  // The guard keys on focus, and pressing the button blurs first: a guard scoped to
  // `editing` instead would tear out this button on that very blur.
  await issueButton(alice.page).click()

  await expect(issueBox(bob.page)).toHaveValue('PP-42')
  await expect(issueBox(alice.page)).toHaveValue('PP-42')

  // Alice's own typed value cannot distinguish an applied snapshot from a blocked one, so
  // move the room past it and require her to follow.
  await issueButton(bob.page).click()
  await issueBox(bob.page).fill('PP-43')
  await issueButton(bob.page).click()
  await expect(issueBox(alice.page)).toHaveValue('PP-43')
})

test('a commit that never blurred the box still lets the room resync it', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await issueButton(alice.page).click()
  await issueBox(alice.page).fill('PP-42')
  // Stands in for macOS, where clicking a button moves no focus: dispatchEvent carries no
  // mousedown, so no blur precedes the commit. A real click blurs first and masks a stuck guard.
  await issueButton(alice.page).dispatchEvent('click')
  // Proves the commit posted, so a failure below is the guard and not a dead synthetic click.
  await expect(issueBox(bob.page)).toHaveValue('PP-42')

  await issueButton(bob.page).click()
  await issueBox(bob.page).fill('PP-43')
  await issueButton(bob.page).click()
  await expect(issueBox(alice.page)).toHaveValue('PP-43')
})

test('a re-vote leaves the caster shown as selected but unconfirmed', async ({ join }) => {
  const alice = await join('Alice')
  const selected = alice.page.locator('.estimation-button-selected')
  const unconfirmed = alice.page.locator('.estimation-button-uncomfirmed')

  await vote(alice.page, '5')
  await expect(selected).toHaveText('5')

  await alice.page.getByRole('button', { name: 'Re-vote' }).click()
  // reVote clears voted and keeps estimation, which is the only state this styling means.
  await expect(unconfirmed).toHaveText('5')
  await expect(selected).toHaveCount(0)

  await alice.page.getByRole('button', { name: 'Clear votes' }).click()
  await expect(unconfirmed).toHaveCount(0)
})
