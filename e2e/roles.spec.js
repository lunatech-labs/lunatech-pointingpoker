import {
  test,
  expect,
  card,
  deck,
  expectSummaryMatchesParticipants,
  facilitatorMark,
  frozenNotice,
  ownEstimation,
  participantEntry,
  results,
  revealedEstimation,
  switchTo,
  tallyEntries,
  unconfirmedCard,
  vote,
  votedMark
} from './fixtures.js'

// Through the role line, then seen by another page, so the switch has landed when this returns.
const becomeFacilitator = async (who, watcher) => {
  await switchTo(who.page, 'facilitator').click()
  await expect(switchTo(who.page, 'voter')).toBeVisible()
  await expect(facilitatorMark(participantEntry(watcher.page, who.name))).toHaveCount(1)
}

test('a room with a facilitator auto-reveals when the voters finish', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const carol = await join('Carol')
  await becomeFacilitator(alice, bob)

  await vote(bob.page, '3')
  await vote(carol.page, '5')
  await expect(results(alice.page)).toBeVisible()
  await expect(revealedEstimation(participantEntry(alice.page, 'Bob'))).toHaveText('3')
  await expect(revealedEstimation(participantEntry(alice.page, 'Carol'))).toHaveText('5')
})

test('the last waiting voter switching to facilitator reveals the round', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  await vote(alice.page, '5')
  await expect(votedMark(participantEntry(bob.page, 'Alice'))).toHaveCount(1)
  await expect(results(bob.page)).toBeHidden()

  await becomeFacilitator(bob, alice)
  await expect(results(alice.page)).toBeVisible()
  await expect(revealedEstimation(participantEntry(alice.page, 'Alice'))).toHaveText('5')
})

test('a switch to facilitator drops the vote from the results', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  await vote(alice.page, '3')
  await vote(bob.page, '8')
  await expect(tallyEntries(alice.page)).toHaveCount(2)

  await becomeFacilitator(bob, alice)
  await expect(tallyEntries(alice.page)).toHaveCount(1)
  await expect(revealedEstimation(participantEntry(alice.page, 'Bob'))).toHaveText('')
  await expectSummaryMatchesParticipants(alice.page)

  // Switching back starts with no estimate, and the round stays revealed.
  await switchTo(bob.page, 'voter').click()
  await expect(deck(bob.page)).toBeVisible()
  await expect(ownEstimation(bob.page)).toHaveCount(0)
  await expect(card(bob.page, '8')).toBeDisabled()
})

test("a facilitator's page has no deck, and keeps Show, Re-vote and Clear", async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  await becomeFacilitator(alice, bob)
  await expect(deck(alice.page)).toHaveCount(0)

  await vote(bob.page, '5')
  // Bob is the only voter, so his vote reveals; Re-vote then reopens it for the Show below.
  await expect(frozenNotice(bob.page)).toBeVisible()
  await expect(frozenNotice(alice.page)).toHaveCount(0)
  await alice.page.getByRole('button', { name: 'Re-vote' }).click()
  await expect(unconfirmedCard(bob.page)).toHaveText('5')
  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await expect(frozenNotice(bob.page)).toBeVisible()
  await alice.page.getByRole('button', { name: 'Clear votes' }).click()
  await expect(frozenNotice(bob.page)).toBeHidden()
  await expect(ownEstimation(bob.page)).toHaveCount(0)
  await expect(deck(alice.page)).toHaveCount(0)
})

// The spec's one-button rule: a restyle rendering one button per role would drop focus.
test('a switch keeps keyboard focus on its one button', async ({ join }) => {
  const alice = await join('Alice')
  await switchTo(alice.page, 'facilitator').focus()
  await alice.page.keyboard.press('Enter')
  await expect(switchTo(alice.page, 'voter')).toBeFocused()
})
