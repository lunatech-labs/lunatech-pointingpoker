import { test, expect, nameInput } from './fixtures.js'

const ROOM_URL = /\/[a-z]+-[a-z]+-[a-z]+$/

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

test('the lobby offers the remembered room rather than joining it', async ({ join, room }) => {
  const alice = await join('Alice')
  await alice.page.goto('/')
  const rejoin = alice.page.getByRole('link', { name: `Rejoin ${room} as Alice` })
  await expect(rejoin).toBeVisible()
  await expect(alice.page.getByRole('button', { name: 'Show votes' })).toBeHidden()
  await rejoin.click()
  await expect(alice.page).toHaveURL(new RegExp(`/${room}$`))
  await expect(alice.page.getByRole('button', { name: 'Show votes' })).toBeVisible()
})

test('Create, Leave and Join change the address, and Leave keeps the name', async ({
  page,
  origin,
  room
}) => {
  await page.goto(`${origin}/`)
  await nameInput(page).fill('Alice')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(ROOM_URL)
  await expect(page.getByRole('button', { name: 'Show votes' })).toBeVisible()

  await page.getByRole('link', { name: 'Leave' }).click()
  await expect(page).toHaveURL(`${origin}/`)
  await expect(nameInput(page)).toHaveValue('Alice')

  await page.getByRole('link', { name: 'Join' }).click()
  await page.locator('#join-roomId').fill(room)
  await page.getByRole('button', { name: 'Join' }).click()
  await expect(page).toHaveURL(`${origin}/${room}`)
  await expect(page.getByRole('button', { name: 'Show votes' })).toBeVisible()
})
