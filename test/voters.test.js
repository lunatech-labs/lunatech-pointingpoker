import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { startApp } from '../testkit/app.js'
import { joinVoters } from '../testkit/voters.js'

const names = ['Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy', 'Mallory',
  'Niaj', 'Olivia', 'Rupert', 'Sybil']

let app
// Above app.js's 30s readiness cap, or the runner cancels the hook before startApp can report
// the captured app output that tells you why the app never came up.
before(async () => {
  app = await startApp()
}, { timeout: 45_000 })
after(() => app?.stop())

// Local rather than e2e/fixtures.js's, which imports Playwright.
const createRoom = async () => {
  const response = await fetch(`${app.baseUrl}/create-room`, { method: 'POST' })
  assert.equal(response.status, 200)
  return (await response.text()).trim()
}

test("every voter's vote succeeds as soon as the call resolves", async t => {
  const { voters, close } = await joinVoters(app.baseUrl, await createRoom(), names)
  t.after(close)
  await Promise.all(voters.map(voter => voter.vote('3')))
})

test("a refused join fails the call with the join's status", async () => {
  await assert.rejects(joinVoters(app.baseUrl, 'no-such-room', ['Ada']), {
    message: 'POST /rooms/no-such-room/join for Ada answered 404'
  })
})

test('a blank vote fails its call with 400', async t => {
  const room = await createRoom()
  const { voters, close } = await joinVoters(app.baseUrl, room, ['Ada'])
  t.after(close)
  await assert.rejects(voters[0].vote(''), {
    message: `POST /rooms/${room}/vote for Ada answered 400`
  })
})
