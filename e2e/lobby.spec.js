import { test, expect, LONGEST_ID, inRoom, nameInput, roomIdInput } from './fixtures.js'

const ROOM_URL = /\/[a-z]+-[a-z]+-[a-z]+$/

// The join fixture clicks the buttons, so these are the keyboard and paste paths nothing else takes.
test('Enter in the name field creates a room', async ({ page, origin }) => {
  await page.goto(`${origin}/`)
  await nameInput(page).fill('Alice')
  await nameInput(page).press('Enter')
  await expect(inRoom(page)).toBeVisible()
})

test('a room name pasted with spaces into the Join form still joins', async ({
  page,
  origin,
  room
}) => {
  await page.goto(`${origin}/`)
  await page.getByRole('link', { name: 'Join' }).click()
  await roomIdInput(page).fill(`  ${room} `)
  await nameInput(page).fill('Alice')
  await nameInput(page).press('Enter')
  await expect(inRoom(page)).toBeVisible()
  await expect(page.getByRole('heading', { name: room, exact: true })).toBeVisible()
})

test('the lobby offers the remembered room rather than joining it', async ({ join, room }) => {
  const alice = await join('Alice')
  await alice.page.goto('/')
  // By the room id and the name it rejoins as, whatever their order in the link.
  const rejoin = alice.page.getByRole('link', { name: room })
  await expect(rejoin).toContainText('as Alice')
  await expect(inRoom(alice.page)).toBeHidden()
  await rejoin.click()
  await expect(alice.page).toHaveURL(new RegExp(`/${room}$`))
  await expect(inRoom(alice.page)).toBeVisible()
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
  await expect(inRoom(page)).toBeVisible()

  await page.getByRole('link', { name: 'Leave' }).click()
  await expect(page).toHaveURL(`${origin}/`)
  await expect(nameInput(page)).toHaveValue('Alice')

  await page.getByRole('link', { name: 'Join' }).click()
  await roomIdInput(page).fill(room)
  await page.getByRole('button', { name: 'Join' }).click()
  await expect(page).toHaveURL(`${origin}/${room}`)
  await expect(inRoom(page)).toBeVisible()
})

test('the h1 names the form and the active tab is marked', async ({ page, origin }) => {
  await page.goto(`${origin}/`)
  const h1 = page.getByRole('heading', { level: 1 })
  const create = page.getByRole('link', { name: 'Create', exact: true })
  const join = page.getByRole('link', { name: 'Join', exact: true })
  await expect(h1).toHaveText('Create room')
  await expect(create).toHaveAttribute('aria-current', 'true')
  await expect(join).not.toHaveAttribute('aria-current')
  await join.click()
  await expect(h1).toHaveText('Join room')
  await expect(join).toHaveAttribute('aria-current', 'true')
  await expect(create).not.toHaveAttribute('aria-current')
  // A room's own path with nothing stored: the pinned form, waiting for a name.
  await page.goto(`${origin}/${LONGEST_ID}`)
  await expect(h1).toHaveText('Join room')
  await expect(page.getByText(LONGEST_ID, { exact: true })).toBeVisible()
  await expect(create).toHaveCount(0)
  await expect(join).toHaveCount(0)
  await expect(roomIdInput(page)).toHaveCount(0)
})
