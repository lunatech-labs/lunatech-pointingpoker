import { test, expect, nameInput, switchTo } from './fixtures.js'

const PHONE = { width: 392, height: 800 }
const menu = page => page.getByRole('button', { name: 'Menu' })

test.describe('the phone layout, ☰ and its row', () => {
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
})
