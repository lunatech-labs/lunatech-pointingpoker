import {
  test,
  expect,
  ESTIMATIONS,
  NAMES,
  facilitatorName,
  participantEntries,
  tallyEntries
} from './fixtures.js'
import { testProfile } from '../testkit/app.js'

// The profile writes the grace period in seconds.
const graceMs = Number.parseInt(testProfile.ROOM_GRACE_PERIOD) * 1000

test('a room filled by protocol voters keeps its 13 voters past the grace period', async ({ join, voters }) => {
  // A facilitator, so the 13th vote leaves every voter confirmed and reveals the round.
  const { page } = await join('Alice', { role: 'Facilitator' })
  // The names past the first: 13 voters for the deck's 13 values, Alice making the 14th.
  const joined = await voters(NAMES.slice(1))
  await expect(participantEntries(page)).toHaveCount(13)
  await expect(facilitatorName(page, 'Alice')).toHaveCount(1)
  await Promise.all(joined.map((voter, i) => voter.vote(ESTIMATIONS[i])))
  await page.waitForTimeout(graceMs + 2000)
  await expect(participantEntries(page)).toHaveCount(13)
  await expect(tallyEntries(page)).toHaveCount(13)
})
