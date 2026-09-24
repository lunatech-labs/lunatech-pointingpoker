import { test, expect, movedBanner, nameInput, ownEstimation, vote } from './fixtures.js'

// No query string: the page removes moved=1 before anyone can copy the address.
const ROOM_URL = /\/[a-z]+-[a-z]+-[a-z]+$/

const joinAs = async (page, name) => {
  await nameInput(page).fill(name)
  await page.getByRole('button', { name: 'Join' }).click()
  await expect(page.getByRole('button', { name: 'Show votes' })).toBeVisible()
}

test('an old UUID link opens its derived room under a banner that covers no card', async ({
  page,
  origin
}) => {
  // Phone-sized, where a banner laid over the page would sit on the last cards of the deck.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${origin}/${crypto.randomUUID()}`)
  await expect(page).toHaveURL(ROOM_URL)
  await expect(movedBanner(page)).toBeVisible()
  await joinAs(page, 'Alice')

  const covered = await page.$$eval('.estimation-button', buttons =>
    buttons
      .filter(b => {
        const r = b.getBoundingClientRect()
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return hit && hit.closest('[role="status"]')
      })
      .map(b => b.textContent.trim())
  )
  expect(covered).toEqual([])
  await vote(page, '89')
  await expect(ownEstimation(page)).toHaveText('89')
  await movedBanner(page).getByRole('button', { name: 'Dismiss' }).click()
  await expect(movedBanner(page)).toBeHidden()
})

test('a mistyped room name is refused with a suggestion that reaches the room', async ({
  page,
  origin
}) => {
  const response = await page.goto(`${origin}/brave-golden-oter`)
  expect(response.status()).toBe(404)
  await expect(page.getByText('is not a room name')).toBeVisible()
  await page.getByRole('link', { name: 'brave-golden-otter' }).click()
  await expect(page).toHaveURL(`${origin}/brave-golden-otter`)
  await joinAs(page, 'Alice')
})

test('a name typed into the Join form is checked by the page route', async ({ page, origin }) => {
  await page.goto(`${origin}/`)
  await page.getByRole('link', { name: 'Join' }).click()
  await page.locator('#join-roomId').fill('brave-golden-oter')
  await nameInput(page).fill('Alice')
  await page.getByRole('button', { name: 'Join' }).click()
  await expect(page).toHaveURL(`${origin}/brave-golden-oter`)
  await expect(page.getByRole('link', { name: 'brave-golden-otter' })).toBeVisible()
})

test('a room remembered from before the cutover reopens under its derived name', async ({
  page,
  origin
}) => {
  // Seeded on / only: init scripts run on every navigation, and the rejoin rewrites the key.
  await page.addInitScript(legacy => {
    if (location.pathname === '/') {
      localStorage.setItem('roomId', legacy)
      localStorage.setItem('name', 'Alice')
    }
  }, crypto.randomUUID())
  await page.goto(`${origin}/`)
  await expect(page).toHaveURL(ROOM_URL)
  await expect(page.getByRole('button', { name: 'Show votes' })).toBeVisible()
})

test('a refused room creation says so', async ({ page, origin }) => {
  // The server answers 503 only once every name it draws is live, too many rooms to open here.
  await page.route('**/create-room', route => route.fulfill({ status: 503 }))
  await page.goto(`${origin}/`)
  await nameInput(page).fill('Alice')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('alert')).toHaveText('Could not create a room. Please try again.')
})
