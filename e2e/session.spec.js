import {
  test,
  expect,
  expectSummaryMatchesTable,
  participantRow,
  participantRows,
  summaryTable,
  votedMark,
  vote
} from './fixtures.js'

// One meeting rather than one feature. Every case in room.spec.js starts from a fresh room and
// exercises a single behaviour, which is how a re-vote in progress went untallied for a whole
// step: no case crossed a re-vote with a reveal, and in every round the two renderings of the
// estimations happened to agree. What this walks is the states a round leaves behind.
//
// Each reveal asserts the row count before the invariant, and never the invariant alone: with
// the summary not yet rendered both sides are empty and agree, so the invariant on its own
// would pass on a snapshot that never arrived.
test('a session of rounds keeps the summary honest across them', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const carol = await join('Carol')
  // Dave never votes until the last round, so a participant in the never-voted state is present
  // in every tally along the way.
  const dave = await join('Dave')
  for (const page of [alice.page, bob.page, carol.page]) {
    await expect(participantRows(page)).toHaveCount(4)
  }

  const show = page => page.getByRole('button', { name: 'Show votes' }).click()
  const reVote = page => page.getByRole('button', { name: 'Re-vote' }).click()

  // Half the room votes and the facilitator reveals anyway.
  await vote(alice.page, '3')
  await vote(bob.page, '5')
  await expect(votedMark(participantRow(carol.page, 'Bob'))).toHaveCount(1)
  await show(alice.page)
  await expect(summaryTable(carol.page).locator('tbody tr')).toHaveCount(2)
  await expectSummaryMatchesTable(carol.page)

  // Re-vote, then reveal with nobody having re-confirmed. The estimations stand and the
  // confirmations do not, which is the one state where the table and the summary can disagree.
  await reVote(alice.page)
  await expect(summaryTable(carol.page)).toBeHidden()
  await expect(votedMark(participantRow(carol.page, 'Bob'))).toHaveCount(0)
  await show(alice.page)
  await expect(summaryTable(carol.page).locator('tbody tr')).toHaveCount(2)
  await expectSummaryMatchesTable(carol.page)

  // The straggler votes at last. The reveal closed the round, so the room reopens first.
  await reVote(alice.page)
  await expect(summaryTable(carol.page)).toBeHidden()
  await vote(carol.page, '8')
  await expect(votedMark(participantRow(alice.page, 'Carol'))).toHaveCount(1)
  await show(alice.page)
  await expect(summaryTable(alice.page).locator('tbody tr')).toHaveCount(3)
  await expectSummaryMatchesTable(alice.page)

  // Somebody changes their mind, which converges two participants on one estimate and gives
  // the headline a majority to report.
  await reVote(alice.page)
  await expect(summaryTable(alice.page)).toBeHidden()
  await vote(alice.page, '5')
  await expect(votedMark(participantRow(bob.page, 'Alice'))).toHaveCount(1)
  await show(bob.page)
  await expect(summaryTable(bob.page).locator('tbody tr')).toHaveCount(2)
  await expectSummaryMatchesTable(bob.page)
  // Scoped to the card: .estimation-text is also every revealed cell in the table.
  await expect(bob.page.locator('.summary-card .estimation-text')).toHaveText('5')

  // Clear ends the round instead of reopening it. Asserting the cleared table proves nothing,
  // since an unrevealed round renders no values either way: the next round is the real check.
  await bob.page.getByRole('button', { name: 'Clear votes' }).click()
  await expect(summaryTable(bob.page)).toBeHidden()
  await expect(votedMark(participantRow(bob.page, 'Alice'))).toHaveCount(0)

  await vote(dave.page, '13')
  await expect(votedMark(participantRow(alice.page, 'Dave'))).toHaveCount(1)
  await show(alice.page)
  // One row and one row only: three rounds of estimations died with the Clear.
  await expect(summaryTable(alice.page).locator('tbody tr')).toHaveCount(1)
  await expectSummaryMatchesTable(alice.page)

  // Nobody presses anything from here. Five rounds of Show have not once let the room reveal
  // itself, which is the ordinary way a round ends.
  await reVote(alice.page)
  await expect(summaryTable(alice.page)).toBeHidden()
  for (const page of [alice.page, bob.page, carol.page]) await vote(page, '8')
  // Three of four: still hidden, so the next line is the latch firing rather than a stale table.
  await expect(summaryTable(alice.page)).toBeHidden()
  await vote(dave.page, '8')
  await expect(summaryTable(alice.page)).toBeVisible()
  await expect(summaryTable(alice.page).locator('tbody tr')).toHaveCount(1)
  await expectSummaryMatchesTable(alice.page)

  // The same latch after a clear rather than a re-vote, the two resets it has to re-arm from.
  // Not a residue check: everyone voting overwrites whatever the clear left behind.
  await alice.page.getByRole('button', { name: 'Clear votes' }).click()
  await expect(summaryTable(alice.page)).toBeHidden()
  for (const page of [alice.page, bob.page, carol.page]) await vote(page, '5')
  await expect(summaryTable(alice.page)).toBeHidden()
  await vote(dave.page, '3')
  await expect(summaryTable(alice.page)).toBeVisible()
  await expect(summaryTable(alice.page).locator('tbody tr')).toHaveCount(2)
  await expectSummaryMatchesTable(alice.page)
})
