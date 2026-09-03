import {
  test,
  expect,
  connectionAlert,
  connectionLost,
  participantRow,
  participantRows,
  summaryTable,
  issueBox,
  issueButton,
  votedMark,
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

  await expect(participantRow(alice.page, 'Bob')).toHaveCount(0, { timeout: 20_000 })
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

  // A vote landing on Bob's page is the proof his stream came back usable. The two reconnect
  // cases below cannot assert this themselves: test.fail() accepts a timeout as expected.
  await vote(alice.page, '5')
  await expect(votedMark(participantRow(bob.page, 'Alice').first())).toHaveCount(1, {
    timeout: 10_000
  })
})

test('a departure is announced while another participant is cut', async ({ join }) => {
  await departureWhileCut(join)
})

test('a Show survives someone joining', async ({ join }) => {
  test.fail(true, 'step 1: revealed becomes a stored latch instead of a client-side allVoted()')
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
  test.fail(true, 'step 1: revealed becomes a stored latch instead of a client-side allVoted()')
  const alice = await join('Alice')
  const bob = await join('Bob')

  await vote(alice.page, '5')
  await vote(bob.page, '3')
  await expect(summaryTable(alice.page)).toBeVisible()

  await join('Carol')
  await expect(participantRow(alice.page, 'Carol')).toHaveCount(1)
  await expect(summaryTable(alice.page)).toBeVisible({ timeout: 2000 })
})

test('the tally counts only the votes that were cast', async ({ join }) => {
  test.fail(true, 'step 3: a voted-only tally, landing with the template guard beside it')
  const alice = await join('Alice')
  await join('Bob')

  await vote(alice.page, '5')
  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await expect(summaryTable(alice.page)).toBeVisible()

  // Today Bob's empty estimation is a row of its own.
  await expect(summaryTable(alice.page).locator('tbody tr')).toHaveCount(1, { timeout: 2000 })
})

test('no duplicate participants after a reconnect', async ({ join }) => {
  test.fail(true, 'step 1: a snapshot replaces the replay that pushes a second entry')
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
  test.fail(true, 'step 1: a snapshot is the whole list, so a departure cannot be missed')
  const { bob } = await departureWhileCut(join)

  await expect(participantRow(bob.page, 'Carol')).toHaveCount(0, { timeout: 2000 })
})
