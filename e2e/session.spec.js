import {
  test,
  expect,
  expectSummaryMatchesParticipants,
  mostVoted,
  participantEntry,
  participantEntries,
  results,
  tallyEntries,
  votedMark,
  vote
} from './fixtures.js'

// One meeting rather than one feature: the fresh-room cases beside this never crossed a re-vote
// with a reveal. Why it exists, and why each reveal counts entries first: the spec's step 3b entry.
test('a session of rounds keeps the summary honest across them', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const carol = await join('Carol')
  // Dave never votes until the last round, so a participant in the never-voted state is present
  // in every tally along the way.
  const dave = await join('Dave')
  for (const page of [alice.page, bob.page, carol.page]) {
    await expect(participantEntries(page)).toHaveCount(4)
  }

  const show = page => page.getByRole('button', { name: 'Show votes' }).click()
  const reVote = page => page.getByRole('button', { name: 'Re-vote' }).click()

  // Half the room votes and the facilitator reveals anyway.
  await vote(alice.page, '3')
  await vote(bob.page, '5')
  await expect(votedMark(participantEntry(carol.page, 'Bob'))).toHaveCount(1)
  await show(alice.page)
  await expect(tallyEntries(carol.page)).toHaveCount(2)
  await expectSummaryMatchesParticipants(carol.page)

  // Re-vote, then reveal with nobody having re-confirmed. The estimations stand and the
  // confirmations do not, which is the one state where the list and the summary can disagree.
  await reVote(alice.page)
  await expect(results(carol.page)).toBeHidden()
  await expect(votedMark(participantEntry(carol.page, 'Bob'))).toHaveCount(0)
  await show(alice.page)
  await expect(tallyEntries(carol.page)).toHaveCount(2)
  await expectSummaryMatchesParticipants(carol.page)

  // The straggler votes at last. The reveal closed the round, so the room reopens first.
  await reVote(alice.page)
  await expect(results(carol.page)).toBeHidden()
  await vote(carol.page, '8')
  await expect(votedMark(participantEntry(alice.page, 'Carol'))).toHaveCount(1)
  await show(alice.page)
  await expect(tallyEntries(alice.page)).toHaveCount(3)
  await expectSummaryMatchesParticipants(alice.page)

  // Somebody changes their mind, which converges two participants on one estimate and gives
  // the headline a majority to report.
  await reVote(alice.page)
  await expect(results(alice.page)).toBeHidden()
  await vote(alice.page, '5')
  await expect(votedMark(participantEntry(bob.page, 'Alice'))).toHaveCount(1)
  await show(bob.page)
  await expect(tallyEntries(bob.page)).toHaveCount(2)
  await expectSummaryMatchesParticipants(bob.page)
  await expect(mostVoted(bob.page)).toHaveText('5')

  // Clear ends the round instead of reopening it. Asserting the cleared list proves nothing,
  // since an unrevealed round renders no values either way: the next round is the real check.
  await bob.page.getByRole('button', { name: 'Clear votes' }).click()
  await expect(results(bob.page)).toBeHidden()
  await expect(votedMark(participantEntry(bob.page, 'Alice'))).toHaveCount(0)

  await vote(dave.page, '13')
  await expect(votedMark(participantEntry(alice.page, 'Dave'))).toHaveCount(1)
  await show(alice.page)
  // One entry and one entry only: three rounds of estimations died with the Clear.
  await expect(tallyEntries(alice.page)).toHaveCount(1)
  await expectSummaryMatchesParticipants(alice.page)

  // Nobody presses anything from here. Five rounds of Show have not once let the room reveal
  // itself, which is the ordinary way a round ends.
  await reVote(alice.page)
  await expect(results(alice.page)).toBeHidden()
  for (const page of [alice.page, bob.page, carol.page]) await vote(page, '8')
  // Three of four: still hidden, so the next line is the latch firing rather than stale results.
  await expect(results(alice.page)).toBeHidden()
  await vote(dave.page, '8')
  await expect(results(alice.page)).toBeVisible()
  await expect(tallyEntries(alice.page)).toHaveCount(1)
  await expectSummaryMatchesParticipants(alice.page)

  // The same latch after a clear rather than a re-vote, the two resets it has to re-arm from.
  // Not a residue check: everyone voting overwrites whatever the clear left behind.
  await alice.page.getByRole('button', { name: 'Clear votes' }).click()
  await expect(results(alice.page)).toBeHidden()
  for (const page of [alice.page, bob.page, carol.page]) await vote(page, '5')
  await expect(results(alice.page)).toBeHidden()
  await vote(dave.page, '3')
  await expect(results(alice.page)).toBeVisible()
  await expect(tallyEntries(alice.page)).toHaveCount(2)
  await expectSummaryMatchesParticipants(alice.page)
})
