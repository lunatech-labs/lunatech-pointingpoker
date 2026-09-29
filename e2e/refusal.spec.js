import {
  test,
  expect,
  connectionLost,
  nameInput,
  participantRow,
  restartNotice
} from './fixtures.js'

// Two watchdog ticks, long enough for a reload or a second stream to have happened.
const TWO_TICKS_MS = 10_000

test('a session ended by a restart rejoins under its name, with the restart notice', async ({
  join,
  app,
  room
}) => {
  const alice = await join('Alice')
  await join('Bob')
  await app.restart()

  await expect(restartNotice(alice.page)).toBeVisible({ timeout: 20_000 })
  await expect(alice.page).toHaveURL(new RegExp(`/${room}$`))
  await expect(participantRow(alice.page, 'Alice')).toHaveCount(1)
  await expect(participantRow(alice.page, 'Bob')).toHaveCount(1, { timeout: 20_000 })
  await restartNotice(alice.page).getByRole('button', { name: 'Dismiss' }).click()
  await expect(restartNotice(alice.page)).toBeHidden()
})

test('a page waits under the banner while the app is down, rather than reloading', async ({
  join,
  app
}) => {
  const alice = await join('Alice')
  await alice.page.evaluate(() => (window.sameLoad = true))

  await app.restart(async () => {
    await expect(connectionLost(alice.page)).toBeVisible()
    // The stub answers 502 meanwhile, which a reload would have landed on.
    await alice.page.waitForTimeout(TWO_TICKS_MS)
    expect(await alice.page.evaluate(() => window.sameLoad)).toBe(true)
  })

  await expect(restartNotice(alice.page)).toBeVisible({ timeout: 20_000 })
})

test('a page refused before it reached the room stops at the message', async ({
  page,
  origin,
  room
}) => {
  const streams = []
  page.on('request', request => {
    if (request.url().includes('/events?')) streams.push(request.url())
  })
  // Every load would be refused alike, as with a SECURE_COOKIES mismatch, so a reload would loop.
  await page.route(/\/events\?/, route => route.fulfill({ status: 401 }))
  await page.goto(`${origin}/${room}`)
  await page.evaluate(() => (window.sameLoad = true))
  await nameInput(page).fill('Alice')
  await page.getByRole('button', { name: 'Join' }).click()

  await expect(page.getByRole('alert')).toHaveText(
    'Your session has ended. Please reload the page to rejoin.',
    { timeout: 10_000 }
  )
  // A click here would be ignored, since the one join this page gets already ran.
  await expect(page.getByRole('button', { name: 'Join' })).toBeDisabled()
  await expect(nameInput(page)).toBeDisabled()
  await page.waitForTimeout(TWO_TICKS_MS)
  expect(streams).toHaveLength(1)
  expect(await page.evaluate(() => window.sameLoad)).toBe(true)
})

test('a command refused by a different instance recovers without the stream ever closing', async ({
  join,
  room
}) => {
  const alice = await join('Alice')
  const requests = []
  alice.page.on('request', request => {
    if (request.url().includes('/events?')) requests.push('stream')
    else if (request.isNavigationRequest()) requests.push('page')
  })
  let refuseOnce = true
  await alice.page.route(new RegExp(`/rooms/${room}/show$`), route => {
    if (!refuseOnce) return route.continue()
    refuseOnce = false
    return route.fulfill({ status: 401 })
  })

  // A rolling redeploy: the stream stays pinned to the old instance, healthy throughout, while
  // this command lands on the new one, which does not know the session and answers 401.
  await alice.page.getByRole('button', { name: 'Show votes' }).click()

  await expect(restartNotice(alice.page)).toBeVisible({ timeout: 20_000 })
  await expect(alice.page).toHaveURL(new RegExp(`/${room}$`))
  // Only the reloaded page's own stream; a reopen before the reload would come first.
  await expect.poll(() => requests).toEqual(['page', 'stream'])
})
