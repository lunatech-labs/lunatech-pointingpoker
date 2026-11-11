import { test, expect, issueBox, issueEdit, issuePanel, issueText } from './fixtures.js'

test('an open issue editor shows the notice once the room moves on, and OK puts focus on Edit', async ({
  join,
  room
}) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const panel = issuePanel(alice.page)

  await issueEdit(alice.page).click()
  await issueBox(alice.page).fill('mine')
  await bob.page.getByRole('button', { name: 'Show votes' }).click()
  const posted = await bob.page.request.post(`/rooms/${room}/next-issue`, {
    data: { round: 1, issue: 'PP-2' }
  })
  expect(posted.status()).toBe(204)

  await expect(panel.getByRole('status')).toHaveText('The room moved on to: "PP-2" OK')
  await expect(issueBox(alice.page)).toHaveCount(0)
  // The field held focus, so its text takes it and a keystroke meant for the form presses nothing.
  await expect(panel.getByText('The room moved on to: "PP-2"')).toBeFocused()

  await panel.getByRole('button', { name: 'OK' }).click()
  await expect(panel.getByRole('status')).toBeEmpty()
  await expect(issueText(alice.page)).toHaveText('PP-2')
  await expect(issueEdit(alice.page)).toBeFocused()
})
