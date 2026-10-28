import {
  test,
  expect,
  ISSUE_240,
  deck,
  issueEdit,
  nameInput,
  readBoxes,
  roundBar,
  roundSlot,
  setIssue,
  switchTo,
  table
} from './fixtures.js'

const PHONE = { width: 392, height: 800 }
const menu = page => page.getByRole('button', { name: 'Menu' })

const twoFrames = page =>
  page.evaluate(
    () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  )
// scrollY after two frames, as a browser's own focus scroll may land a frame later.
const scrollTop = async page => {
  await twoFrames(page)
  return page.evaluate(() => scrollY)
}
// The round panel in both phases, as the slot's parent.
const roundPanel = page => roundSlot(page).locator('..')
const roster = page => page.getByRole('complementary', { name: 'Participants' })

// Alice's page at scroll 0 with the table's foot behind the round panel, checked so a drift fails.
const tableBehindPanel = async join => {
  const { page } = await join('Alice', { role: 'Voter' })
  await setIssue(page, ISSUE_240)
  await page.evaluate(() => scrollTo(0, 0))
  const sheet = { table: table(page), panel: roundPanel(page), bar: roundBar(page) }
  const { table: box, panel, bar } = (await readBoxes(page, sheet)).boxes
  const foot = box.y + box.height
  expect(bar.y + bar.height, 'the round bar pinned to the bottom').toBeCloseTo(800, 0)
  expect(box.y, "the table's top above the round panel's").toBeLessThan(panel.y)
  expect(foot, "the table's foot below the round panel's top").toBeGreaterThan(panel.y)
  expect(foot, "the table's foot above the round bar's top").toBeLessThan(bar.y)
  return page
}

test.describe("☰'s row and a keyboard focus on the phone", () => {
  test.use({ viewport: PHONE })

  test('☰ opens its row and closes it again', async ({ join }) => {
    const { page } = await join('Alice')
    await menu(page).click()
    await expect(menu(page)).toHaveAttribute('aria-expanded', 'true')
    await expect(switchTo(page, 'facilitator')).toBeVisible()
    await menu(page).click()
    await expect(menu(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(switchTo(page, 'facilitator')).toBeHidden()
  })

  test('the row stays open through a widen and a narrow', async ({ join }) => {
    const { page } = await join('Alice')
    await menu(page).click()
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(switchTo(page, 'facilitator')).toBeVisible()
    // A resize observer fires in a frame, so one at the wide width must run first.
    await twoFrames(page)
    await page.setViewportSize(PHONE)
    await expect(menu(page)).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('link', { name: 'Leave' })).toBeVisible()
  })

  test("the row's switch changes the role and keeps the row open and focused", async ({
    join
  }) => {
    const { page } = await join('Alice')
    await menu(page).click()
    await switchTo(page, 'facilitator').click()
    await expect(switchTo(page, 'voter')).toBeFocused()
    await expect(menu(page)).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByText('You are a facilitator.', { exact: true })).toBeVisible()
  })

  test("the row's Leave reaches the lobby", async ({ join }) => {
    const { page } = await join('Alice')
    await menu(page).click()
    await page.getByRole('link', { name: 'Leave' }).click()
    await expect(nameInput(page)).toBeVisible()
  })

  test('the open row follows a switch in another tab', async ({ join }) => {
    const alice = await join('Alice')
    const { page } = alice
    await menu(page).click()
    const tab = await alice.newTab()
    await menu(tab).click()
    await switchTo(tab, 'facilitator').click()
    await expect(page.getByText('You are a facilitator.', { exact: true })).toBeVisible()
    await expect(switchTo(page, 'voter')).toBeVisible()
    await expect(menu(page)).toHaveAttribute('aria-expanded', 'true')
  })

  test('Escape inside the row closes it and focuses ☰', async ({ join }) => {
    const { page } = await join('Alice')
    await menu(page).focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Tab')
    await expect(switchTo(page, 'facilitator')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(switchTo(page, 'facilitator')).toBeHidden()
    await expect(menu(page)).toBeFocused()
    await expect(menu(page)).toHaveAttribute('aria-expanded', 'false')
  })

  test('Escape on ☰ closes the open row, and once closed does nothing', async ({ join }) => {
    const { page } = await join('Alice')
    await menu(page).focus()
    await page.keyboard.press('Enter')
    await expect(menu(page)).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(menu(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(switchTo(page, 'facilitator')).toBeHidden()
    await page.keyboard.press('Escape')
    await expect(menu(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(switchTo(page, 'facilitator')).toBeHidden()
  })

  test('Escape elsewhere leaves the row open', async ({ join }) => {
    const { page } = await join('Alice')
    await menu(page).click()
    await page.getByRole('link', { name: 'Copy link' }).focus()
    await page.keyboard.press('Escape')
    await expect(menu(page)).toHaveAttribute('aria-expanded', 'true')
    await expect(switchTo(page, 'facilitator')).toBeVisible()
  })

  test('a keyboard focus behind the round panel scrolls clear of it', async ({ join }) => {
    const page = await tableBehindPanel(join)
    await issueEdit(page).focus()
    await page.keyboard.press('Tab')
    await expect(table(page)).toBeFocused()
    const { table: box, panel } = (await readBoxes(page, {
      table: table(page),
      panel: roundPanel(page)
    })).boxes
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(panel.y)
  })

  test('a tap on the table scrolls nothing', async ({ join }) => {
    const page = await tableBehindPanel(join)
    const box = (await readBoxes(page, { table: table(page) })).boxes.table
    await page.mouse.click(box.x + 8, box.y + 8)
    await expect(table(page)).toBeFocused()
    expect(await scrollTop(page)).toBe(0)
  })

  test('a keyboard focus in view above the sheet scrolls nothing', async ({ join }) => {
    const page = await tableBehindPanel(join)
    await menu(page).focus()
    await page.keyboard.press('Tab')
    await expect(issueEdit(page)).toBeFocused()
    expect(await scrollTop(page)).toBe(0)
  })

  test('a keyboard focus inside the sheet scrolls nothing', async ({ join }) => {
    const page = await tableBehindPanel(join)
    const box = (await readBoxes(page, { table: table(page) })).boxes.table
    await page.mouse.click(box.x + 8, box.y + 8)
    await expect(table(page)).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(deck(page).getByRole('button').first()).toBeFocused()
    expect(await scrollTop(page)).toBe(0)
  })

  test('in the wide layout, a keyboard focus scrolls nothing', async ({ join }) => {
    const { page } = await join('Alice', { role: 'Voter' })
    await page.setViewportSize({ width: 1280, height: 450 })
    await page.evaluate(() => scrollTo(0, 0))
    const read = await readBoxes(page, { roster: roster(page), panel: roundPanel(page) })
    const { roster: box, panel } = read.boxes
    expect(read.scrolls, 'the page scrolls').toBeGreaterThan(0)
    expect(box.y, "the roster's top in view").toBeGreaterThanOrEqual(0)
    expect(box.y + box.height, "the roster's foot in view").toBeLessThanOrEqual(450)
    expect(box.y + box.height, "the roster's foot below the round panel's top").toBeGreaterThan(
      panel.y
    )
    await page.getByRole('button', { name: 'Show votes' }).focus()
    await page.evaluate(() => scrollTo(0, 0))
    const before = await scrollTop(page)
    await page.keyboard.press('Tab')
    await expect(roster(page)).toBeFocused()
    expect(await scrollTop(page)).toBe(before)
  })
})
