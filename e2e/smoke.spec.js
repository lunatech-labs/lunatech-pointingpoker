import { test, expect, nameInput, participantRow } from './fixtures.js'

test('create a room through the stub and reach the room view', async ({ page, origin }) => {
  await page.goto(`${origin}/`)
  await nameInput(page).fill('Alice')
  await page.getByRole('button', { name: 'Create' }).click()

  // inRoom flips on the first SSE message, so this proves the whole path: a POST through the
  // stub, then a stream through it.
  await expect(page.getByRole('button', { name: 'Show votes' })).toBeVisible()
  await expect(participantRow(page, 'Alice')).toHaveCount(1)
})
