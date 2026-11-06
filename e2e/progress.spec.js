import { test, expect, expectFits, progressRegion, roundSlot } from './fixtures.js'

// A name line by its label, as drawn: "No vote: …" or "Not confirmed: …".
const nameLine = (page, label) =>
  progressRegion(page).getByRole('paragraph').filter({ hasText: `${label}:` })

// The share of the line's content width its text leaves free; a range reads the text past the clip.
// Read after the fonts and two frames, so an observer's refit lands first.
const spare = line =>
  line.evaluate(async el => {
    await document.fonts.ready
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const range = document.createRange()
    range.selectNodeContents(el)
    const style = getComputedStyle(el)
    const room =
      el.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    return 1 - range.getBoundingClientRect().width / room
  })

// The table's order is by name. Two names that fit side by side at 1280 but neither alone at 320.
const PAIR = ['Alexandra Vasquez', 'Bartholomew Kingsley']
// After PAIR, every name fits at 1280 by 600 with about 10 % to spare; the last two outweigh "and 2 more".
const MORE = ['Cy', 'Daniel', 'Maximilian Weber']

test.describe(() => {
  test.use({ viewport: { width: 1280, height: 640 } })

  test('the phone shows the count where no name fits', async ({ join, voters }) => {
    const { page } = await join('Bob', { role: 'Facilitator' })
    await voters(PAIR)
    const line = nameLine(page, 'No vote')
    await expect(line, 'premise: every name').toHaveText(`No vote: ${PAIR.join(', ')}`)
    await expectFits(page)

    await page.setViewportSize({ width: 320, height: 640 })
    await expect(line, 'the count at 320').toHaveText('No vote: 2')
    await expectFits(page)
    const slot = await progressRegion(page).evaluate(async region => {
      await document.fonts.ready
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const style = getComputedStyle(region)
      const top = region.firstElementChild.getBoundingClientRect().top
      const bottom = region.lastElementChild.getBoundingClientRect().bottom
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
      const height = region.closest('[data-testid="round-slot"]').getBoundingClientRect().height
      return { height, content: bottom - top + padding }
    })
    const off = Math.abs(slot.height - slot.content)
    expect(off, `the slot as tall as the panel, ${JSON.stringify(slot)}`).toBeLessThanOrEqual(0.5)

    // Review Focus 4: a window that changes only in height refits the line through its font.
    await page.setViewportSize({ width: 1280, height: 600 })
    await voters(MORE)
    const all = [...PAIR, ...MORE]
    await expect(line, 'premise: every name at 600').toHaveText(`No vote: ${all.join(', ')}`)
    const free = await spare(line)
    expect(free, 'premise: about 10 % to spare at 600').toBeGreaterThan(0.05)
    expect(free, 'premise: about 10 % to spare at 600').toBeLessThan(0.15)
    await page.setViewportSize({ width: 1280, height: 1000 })
    const rem = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).fontSize)
    )
    expect(rem, 'the root at 1000').toBeCloseTo(18.5, 0)
    await expect(line, 'the shorter candidate at 1000').toHaveText(
      `No vote: ${all.slice(0, -2).join(', ')} and 2 more`
    )
    await expectFits(page)
  })
})

// Three fit the phone's line and four do not; Bo's fox falls back to another font (Review Focus 2).
const THREE = ['Al', 'Bo 🦊', 'Camille']
const FOURTH = 'Dominique'
// Literally too wide for the line; without its tags, even in bold, it would fit (Review Focus 1).
const MARKUP = `<b>${'W'.repeat(9)}</b>`

test.describe(() => {
  test.use({ viewport: { width: 392, height: 800 } })

  test('a voter joining drops a line from every name', async ({ join, voters }) => {
    const { page } = await join('Bob', { role: 'Facilitator' })
    await voters(THREE)
    const line = nameLine(page, 'No vote')
    await expect(line, 'premise: every name').toHaveText(`No vote: ${THREE.join(', ')}`)
    const width = async () => (await line.boundingBox()).width
    const before = await width()
    await voters([FOURTH])
    await expect(line).toHaveText(`No vote: ${THREE.slice(0, 2).join(', ')} and 2 more`)
    expect(await width(), "the line's width").toBe(before)
    await expectFits(page)
  })

  test('a name written as markup is measured as text', async ({ join, voters }) => {
    const { page } = await join('Bob', { role: 'Facilitator' })
    await voters([MARKUP])
    await expect(nameLine(page, 'No vote')).toHaveText('No vote: 1')
    await expectFits(page)
  })
})

test.describe(() => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('the Progress region through a first round, a Re-vote and a Leave', async ({
    join,
    voters
  }) => {
    const bob = await join('Bob', { role: 'Facilitator' })
    const region = progressRegion(bob.page)
    await expect(region, 'alone').toMatchAriaSnapshot(`
      - region "Progress":
        - paragraph: No voters yet
    `)
    const alice = await join('Alice')
    const [carol, dave] = await voters(['Carol', 'Dave'])
    await expect(region, 'nobody voted').toMatchAriaSnapshot(`
      - region "Progress":
        - paragraph: 0 of 3 voted
        - paragraph: "No vote: Alice, Carol, Dave"
    `)
    await carol.vote('3')
    await expect(region, 'Carol voted').toMatchAriaSnapshot(`
      - region "Progress":
        - paragraph: 1 of 3 voted
        - paragraph: "No vote: Alice, Dave"
    `)
    await alice.page.getByRole('button', { name: '5', exact: true }).click()
    await dave.vote('8')
    await expect(roundSlot(bob.page), 'revealed').toContainText('Most voted')
    await bob.page.getByRole('button', { name: 'Re-vote' }).click()
    await expect(region, 'a Re-vote').toMatchAriaSnapshot(`
      - region "Progress":
        - paragraph: 0 of 3 voted
        - paragraph: "Not confirmed: Alice, Carol, Dave"
    `)
    await carol.vote('3')
    const [erin] = await voters(['Erin'])
    await expect(region, 'Carol confirmed, Erin joined').toMatchAriaSnapshot(`
      - region "Progress":
        - paragraph: 1 of 4 voted
        - paragraph: "No vote: Erin"
        - paragraph: "Not confirmed: Alice, Dave"
    `)
    await dave.vote('8')
    await erin.vote('5')
    await expect(region, 'all but Alice voted').toContainText('3 of 4 voted')
    await alice.page.getByRole('link', { name: 'Leave' }).click()
    await expect(region, 'Alice left').toMatchAriaSnapshot(`
      - region "Progress":
        - paragraph: 3 of 3 voted
        - paragraph: Everybody voted
    `)
    // Review Focus 5: no fit leaves its scratch node behind.
    const left = await bob.page.evaluate(
      () => document.querySelectorAll('body > [aria-hidden="true"]').length
    )
    expect(left, "scratch nodes left in the body").toBe(0)
  })

  test('every segment of the bar has the same width', async ({ join, voters }) => {
    const bob = await join('Bob', { role: 'Facilitator' })
    const alice = await join('Alice')
    const [carol, dave] = await voters(['Carol', 'Dave'])
    await alice.page.getByRole('button', { name: '5', exact: true }).click()
    await carol.vote('3')
    await dave.vote('8')
    await expect(roundSlot(bob.page), 'revealed').toContainText('Most voted')
    await bob.page.getByRole('button', { name: 'Re-vote' }).click()
    const region = progressRegion(bob.page)
    await expect(region, 'a Re-vote').toContainText('0 of 3 voted')
    await carol.vote('3')
    await voters(['Erin'])
    await expect(region, 'premise: voted, kept and no-vote').toContainText('1 of 4 voted')
    await expect(region.locator('.progress-segment-confirmed')).toHaveCount(1)
    await expect(region.locator('.progress-segment-kept')).toHaveCount(2)
    await expect(region.locator('.progress-segment-none')).toHaveCount(1)

    const bar = () =>
      region.locator('.progress-bar').evaluate(el => {
        const widths = [...el.children].map(span => span.getBoundingClientRect().width)
        const marks = [...el.querySelectorAll('.progress-segment-kept, .progress-segment-none')].map(
          span => {
            const style = getComputedStyle(span)
            return {
              offset: parseFloat(style.outlineOffset),
              width: parseFloat(style.outlineWidth),
              border: style.borderTopWidth
            }
          }
        )
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
        return { widths, marks, rem, height: el.getBoundingClientRect().height }
      })
    const at800 = await bar()
    const spread = ({ widths }) => Math.max(...widths) - Math.min(...widths)
    expect(spread(at800), `the widths at 800, ${at800.widths}`).toBeLessThanOrEqual(0.5)
    for (const mark of at800.marks) {
      expect(mark.width, 'a mark is drawn').toBeGreaterThan(0)
      // Firefox snaps the outline's width to the pixel, not its offset.
      expect(Math.abs(mark.offset + mark.width), 'the mark inside its segment').toBeLessThanOrEqual(0.5)
      expect(mark.border, 'no border').toBe('0px')
    }
    expect(at800.height, 'the bar 1 rem tall').toBeCloseTo(at800.rem, 1)

    await bob.page.setViewportSize({ width: 1280, height: 1000 })
    await expect.poll(async () => (await bar()).rem, 'the root at 1000').toBeGreaterThan(18)
    const at1000 = await bar()
    expect(spread(at1000), `the widths at 1000, ${at1000.widths}`).toBeLessThanOrEqual(0.5)
  })

  test("the voter's heading counts confirmed votes", async ({ join, voters }) => {
    const bob = await join('Bob', { role: 'Facilitator' })
    const alice = await join('Alice')
    const [carol] = await voters(['Carol'])
    const heading = page => page.getByRole('heading', { level: 2, name: /^Voters/ })
    await carol.vote('3')
    await expect(heading(alice.page), 'voter, voting').toHaveText('Voters · 1 of 2 voted')
    await expect(heading(bob.page), 'facilitator, voting').toHaveText('Voters · 2')
    await alice.page.getByRole('button', { name: '5', exact: true }).click()
    await expect(roundSlot(bob.page), 'revealed').toContainText('Most voted')
    await expect(heading(alice.page), 'voter, revealed').toHaveText('Voters · 2')
    await expect(heading(bob.page), 'facilitator, revealed').toHaveText('Voters · 2')
    await bob.page.getByRole('button', { name: 'Re-vote' }).click()
    await expect(heading(alice.page), 'voter, kept cards').toHaveText('Voters · 0 of 2 voted')
  })
})
