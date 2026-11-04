import {
  test,
  expect,
  deck,
  inRoom,
  mostVoted,
  movedBanner,
  nameInput,
  participantEntry,
  roomIdInput,
  vote
} from './fixtures.js'

// No query string: the page removes moved=1 before anyone can copy the address.
const ROOM_URL = /\/[a-z]+-[a-z]+-[a-z]+$/

const joinAs = async (page, name) => {
  await nameInput(page).fill(name)
  await page.getByRole('button', { name: 'Join' }).click()
  await expect(inRoom(page)).toBeVisible()
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

  const cards = deck(page).getByRole('button')
  // Counted first, so the hit test below cannot pass on no cards at all.
  await expect(cards).toHaveCount(13)
  const covered = await cards.evaluateAll(buttons =>
    buttons
      .filter(b => {
        const r = b.getBoundingClientRect()
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return hit && hit.closest('[role="status"]')
      })
      .map(b => b.textContent.trim())
  )
  expect(covered).toEqual([])
  // Alice is alone, so her vote reveals the round and the deck gives way to the result.
  await vote(page, '89')
  await expect(mostVoted(page)).toHaveText('89')
  await movedBanner(page).getByRole('button', { name: 'Dismiss' }).click()
  await expect(movedBanner(page)).toBeHidden()
})

test('a mistyped room name is refused with a suggestion that reaches the room', async ({
  page,
  origin
}) => {
  const response = await page.goto(`${origin}/brave-golden-oter`)
  expect(response.status()).toBe(404)
  await expect(
    page.getByRole('heading', { name: 'brave-golden-oter is not a valid room name.' })
  ).toBeVisible()
  await expect(page).toHaveTitle('Not a room name')
  await page.getByRole('link', { name: 'brave-golden-otter Join', exact: true }).click()
  await expect(page).toHaveURL(`${origin}/brave-golden-otter`)
  await joinAs(page, 'Alice')
})

test('a name near no room name offers only Join a different room, which opens the Join tab', async ({
  page,
  origin
}) => {
  const response = await page.goto(`${origin}/nothing-like-this`)
  expect(response.status()).toBe(404)
  await expect(
    page.getByRole('heading', { name: 'nothing-like-this is not a valid room name.' })
  ).toBeVisible()
  await expect(page.getByText('Did you mean')).toHaveCount(0)
  await page.getByRole('link', { name: 'Join a different room' }).click()
  await expect(page).toHaveURL(`${origin}/`)
  const join = page.getByRole('link', { name: 'Join', exact: true })
  await expect(join).toHaveAttribute('aria-current', 'true')
})

test('a mistyped name offers to join as the stored name, and opens no stream', async ({
  visitor
}) => {
  // Dana, not Alice: the earlier case's Alice stays listed in this room for the grace period.
  const page = await visitor({ name: 'Dana', defaultRole: 'Voter' })
  const requests = []
  page.on('request', request => requests.push(request.url()))
  await page.goto('/brave-golden-oter')
  const row = page.getByRole('link', { name: 'brave-golden-otter Join as Dana' })
  await expect(row).toBeVisible()
  await row.click()
  await expect(participantEntry(page, 'Dana')).toBeVisible()
  expect(requests.filter(url => url.includes('/rooms/brave-golden-oter/'))).toEqual([])
})

test('a name typed into the Join form is checked by the page route', async ({ page, origin }) => {
  await page.goto(`${origin}/`)
  await page.getByRole('link', { name: 'Join' }).click()
  await roomIdInput(page).fill('brave-golden-oter')
  await nameInput(page).fill('Alice')
  await page.getByRole('button', { name: 'Join' }).click()
  await expect(page).toHaveURL(`${origin}/brave-golden-oter`)
  await expect(page.getByRole('link', { name: 'brave-golden-otter' })).toBeVisible()
})

test('a room remembered from before the cutover reopens under its derived name', async ({
  visitor
}) => {
  // With a default role, so the rejoin joins at once rather than asking for one.
  const page = await visitor({ roomId: crypto.randomUUID(), name: 'Alice', defaultRole: 'Voter' })
  await page.goto('/')
  // The lobby offers it rather than joining it: only a room's own path joins.
  const rejoin = page.getByRole('link', { name: 'your last room' })
  await expect(rejoin).toContainText('as Alice')
  await rejoin.click()
  await expect(page).toHaveURL(ROOM_URL)
  await expect(inRoom(page)).toBeVisible()
})

test('a refused room creation says so', async ({ page, origin }) => {
  // The server answers 503 only once every name it draws is live, too many rooms to open here.
  await page.route('**/create-room', route => route.fulfill({ status: 503 }))
  await page.goto(`${origin}/`)
  await nameInput(page).fill('Alice')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('alert')).toHaveText('Could not create a room. Please try again.')
})
