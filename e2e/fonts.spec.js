import { test, expect, defaultRoleChoice, nameInput } from './fixtures.js'

// The reset sits above Bootstrap; the fence in base.css gives today's markup today's cascade back.
test("today's lobby stays centred and keeps Bootstrap's form spacing", async ({ page, origin }) => {
  await page.goto(`${origin}/`)
  const heading = await page.getByRole('heading', { name: 'Create Room' }).boundingBox()
  const right = page.viewportSize().width - heading.x - heading.width
  expect(Math.abs(heading.x - right)).toBeLessThan(1)
  const name = await nameInput(page).boundingBox()
  const role = await defaultRoleChoice(page).boundingBox()
  // The name row's form-group margin, 1rem.
  expect(role.y - name.y - name.height).toBeCloseTo(16, 0)
})
