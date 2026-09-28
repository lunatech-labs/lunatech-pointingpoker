import { test, expect, nameInput } from './fixtures.js'

// The join fixture clicks the buttons, so these are the keyboard and paste paths nothing else takes.
test('Enter in the name field creates a room', async ({ page, origin }) => {
  await page.goto(`${origin}/`)
  await nameInput(page).fill('Alice')
  await nameInput(page).press('Enter')
  await expect(page.getByRole('button', { name: 'Show votes' })).toBeVisible()
})

test('a room name pasted with spaces into the Join form still joins', async ({
  page,
  origin,
  room
}) => {
  await page.goto(`${origin}/`)
  await page.getByRole('link', { name: 'Join' }).click()
  await page.locator('#join-roomId').fill(`  ${room} `)
  await nameInput(page).fill('Alice')
  await nameInput(page).press('Enter')
  await expect(page.getByRole('button', { name: 'Show votes' })).toBeVisible()
  await expect(page.getByRole('heading', { name: room, exact: true })).toBeVisible()
})
