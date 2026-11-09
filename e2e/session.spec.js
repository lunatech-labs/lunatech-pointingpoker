import {
  test,
  expect,
  expectSummaryMatchesParticipants,
  keptMark,
  mostVoted,
  noVoteMark,
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
  const ends = ['voters-low', 'voters-high']
  const roster = page => page.getByRole('complementary', { name: 'Participants' })
  const face = (page, name) =>
    participantEntry(page, name).getByTestId('participant-estimation').locator('..')

  // Half the room votes and the facilitator reveals anyway.
  await vote(alice.page, '3')
  await vote(bob.page, '5')
  await expect(votedMark(participantEntry(carol.page, 'Bob'))).toHaveCount(1)
  await show(alice.page)
  await expect(tallyEntries(carol.page)).toHaveCount(2)
  await expectSummaryMatchesParticipants(carol.page)
  // Alice's 3 and Bob's 5 tie, so the headline names both and marks both columns.
  await expect(mostVoted(carol.page)).toHaveText('3 · 5')
  await expect(results(carol.page)).toMatchAriaSnapshot(`
    - region "Results":
      - text: Most voted 3 and 5 Tied, 1 vote each
  `)
  const spoken = results(carol.page).getByText('3 and 5', { exact: true })
  await expect(spoken).toHaveCSS('clip-path', 'inset(50%)')
  for (const entry of await tallyEntries(carol.page).all()) {
    await expect(entry).toContainClass('result-column-top')
  }
  // The spread's ends are tinted and named aloud; the no votes are neither.
  await expect(participantEntry(carol.page, 'Alice')).toContainClass('voters-low')
  await expect(participantEntry(carol.page, 'Bob')).toContainClass('voters-high')
  for (const name of ['Carol', 'Dave']) {
    for (const end of ends) await expect(participantEntry(carol.page, name)).not.toContainClass(end)
  }
  const lowest = participantEntry(carol.page, 'Alice').getByText(', lowest', { exact: true })
  await expect(lowest).toHaveCSS('clip-path', 'inset(50%)')
  await expect(face(carol.page, 'Alice')).toHaveCSS('background-color', 'rgb(214, 230, 245)')
  await expect(face(carol.page, 'Bob')).toHaveCSS('background-color', 'rgb(247, 221, 184)')

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
  // Alice and Bob kept, Carol confirmed, Dave with no estimate: each mark on its entries only.
  const marks = { Alice: [1, 0], Bob: [1, 0], Carol: [0, 0], Dave: [0, 1] }
  for (const [name, [kept, none]] of Object.entries(marks)) {
    await expect(keptMark(participantEntry(alice.page, name))).toHaveCount(kept)
    await expect(noVoteMark(participantEntry(alice.page, name))).toHaveCount(none)
  }
  // A kept value is an end like any other, in the table and in the roster's slots.
  await expect(participantEntry(alice.page, 'Alice')).toContainClass('voters-low')
  await expect(participantEntry(alice.page, 'Carol')).toContainClass('voters-high')
  for (const end of ends) await expect(participantEntry(alice.page, 'Bob')).not.toContainClass(end)
  const slot = value => roster(alice.page).getByText(value, { exact: true })
  await expect(slot('3')).toContainClass('roster-value-low')
  await expect(slot('3')).toHaveCSS('background-color', 'rgb(214, 230, 245)')
  await expect(slot('8')).toContainClass('roster-value-high')
  for (const end of ['roster-value-low', 'roster-value-high']) {
    await expect(slot('5')).not.toContainClass(end)
  }
  const rosterLowest = roster(alice.page).getByText(', lowest', { exact: true })
  await expect(rosterLowest).toHaveCSS('clip-path', 'inset(50%)')

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
  await expect(tallyEntries(bob.page).nth(0)).toContainClass('result-column-top')
  await expect(tallyEntries(bob.page).nth(1)).not.toContainClass('result-column-top')
  for (const name of ['Alice', 'Bob']) {
    await expect(participantEntry(bob.page, name)).toContainClass('voters-low')
  }
  await expect(participantEntry(bob.page, 'Carol')).toContainClass('voters-high')

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
