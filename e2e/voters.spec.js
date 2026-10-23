import { test, expect, participantEntries, tallyEntries } from './fixtures.js'
import { testProfile } from '../testkit/app.js'

const names = ['Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy', 'Mallory',
  'Niaj', 'Olivia', 'Rupert']
// Deck.tsx's estimationValues, so every vote is distinct.
const estimations = ['0', '0.5', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?']
// The profile writes the grace period in seconds.
const graceMs = Number.parseInt(testProfile.ROOM_GRACE_PERIOD) * 1000

test('a room filled by protocol voters keeps its 14 entries past the grace period', async ({ join, voters }) => {
  // A facilitator, so the 13th vote leaves every voter confirmed and reveals the round.
  const { page } = await join('Alice', { role: 'Facilitator' })
  const joined = await voters(names)
  await expect(participantEntries(page)).toHaveCount(14)
  await Promise.all(joined.map((voter, i) => voter.vote(estimations[i])))
  await page.waitForTimeout(graceMs + 2000)
  await expect(participantEntries(page)).toHaveCount(14)
  await expect(tallyEntries(page)).toHaveCount(13)
})
