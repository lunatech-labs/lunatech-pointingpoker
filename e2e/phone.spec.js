import { test, expect } from './fixtures.js'

// A phone's layout viewport is 980 px wide unless index.html's viewport meta says otherwise.
test.describe(() => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 392, height: 800 } })

  test('a phone lays the room page out at its own width', async ({ join, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox cannot emulate isMobile')
    const { page } = await join('Alice')
    expect(await page.evaluate(() => window.innerWidth)).toBe(392)
    await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible()
  })
})
