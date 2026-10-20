import { test, expect, inRoom, nameInput, participantEntry } from './fixtures.js'

test('create a room through the stub and reach the room view', async ({ page, origin }) => {
  await page.goto(`${origin}/`)
  await nameInput(page).fill('Alice')
  await page.getByRole('button', { name: 'Create' }).click()

  // The room renders on the first SSE message, so this proves the whole path: a POST through the
  // stub, then a stream through it.
  await expect(inRoom(page)).toBeVisible()
  await expect(participantEntry(page, 'Alice')).toHaveCount(1)
})

test("the room's marker waits for the first snapshot", async ({ page, origin, room }) => {
  let release
  const held = new Promise(resolve => (release = resolve))
  await page.route(/\/events\?/, async route => {
    await held
    await route.continue()
  })
  await page.goto(`${origin}/${room}`)
  await nameInput(page).fill('Alice')
  const opening = page.waitForRequest(/\/events\?/)
  await page.getByRole('button', { name: 'Join' }).click()

  // The join's request answers before its stream opens, so whatever the press draws shows here.
  await opening
  await expect(inRoom(page)).toHaveCount(0)
  release()
  await expect(inRoom(page)).toBeVisible()
})
