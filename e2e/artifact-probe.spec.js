import { test, expect, nameInput, participantRow } from './fixtures.js'

// Throwaway probe: fails on purpose so CI reaches the upload-artifact step, which only runs
// on failure. Delete this file with the branch.
test('deliberate failure that leaves a trace behind', async ({ page, origin }) => {
  await page.goto(`${origin}/`)
  await nameInput(page).fill('Alice')
  await page.getByRole('button', { name: 'Create' }).click()

  // A real room first, so the retained trace carries the same shape as a genuine failure.
  await expect(participantRow(page, 'Alice')).toHaveCount(1)
  await expect(participantRow(page, 'Alice')).toHaveCount(2)
})
