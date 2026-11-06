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
const THREE = ['Al', 'Bo 🦊', 'Camille Roux']
const FOURTH = 'Dominique'
// Literally too wide for the line; without its tags, even in bold, it would fit (Review Focus 1).
const MARKUP = `<b>${'W'.repeat(12)}</b>`

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

// The panel's sizes against the clamps of the table's scale, read after the fonts and two frames.
const panelSizes = page =>
  progressRegion(page).evaluate(async region => {
    await document.fonts.ready
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const root = getComputedStyle(document.documentElement)
    const rem = parseFloat(root.fontSize)
    const token = name => parseFloat(root.getPropertyValue(name)) * rem
    const written = region.closest('.room-page-column').style.getPropertyValue('--table-scale')
    const scale = written === '' ? null : parseFloat(written)
    const clamp = (least, most) => Math.min(most, Math.max(least, least * (scale ?? 1)))
    const name = clamp(token('--text-md'), token('--text-lg'))
    const size = selector => parseFloat(getComputedStyle(region.querySelector(selector)).fontSize)
    return {
      scale,
      name: size('.progress-line'),
      count: size('.progress-count'),
      held: region.querySelector('.progress-lines').getBoundingClientRect().height,
      expected: {
        name,
        count: clamp(token('--text-lg'), token('--text-xl')),
        held: 2 * name * parseFloat(root.getPropertyValue('--leading-tight')) + token('--space-1')
      }
    }
  })

// At 900 by 760 the table's scale is about 1.18 in both browsers: the middle layout, below the cap.
const SIX = ['Ann', 'Ben', 'Cat', 'Dan', 'Eve', 'Fay']

test.describe(() => {
  test.use({ viewport: { width: 900, height: 760 } })

  test("the panel's text follows the table's scale", async ({ join, voters }) => {
    const { page } = await join('Bob', { role: 'Facilitator' })
    await voters(SIX)
    await expect(nameLine(page, 'No vote'), 'premise: one line').toBeVisible()
    const follows = async when => {
      const sizes = await panelSizes(page)
      const at = `${when}, ${JSON.stringify(sizes)}`
      expect(Math.abs(sizes.name - sizes.expected.name), `the names ${at}`).toBeLessThanOrEqual(0.5)
      expect(Math.abs(sizes.count - sizes.expected.count), `the count ${at}`).toBeLessThanOrEqual(0.5)
      expect(Math.abs(sizes.held - sizes.expected.held), `the held lines ${at}`).toBeLessThanOrEqual(0.5)
      return sizes
    }
    const middle = await panelSizes(page)
    expect(middle.scale, 'premise: a scale written on the column').not.toBeNull()
    expect(middle.scale, 'premise: a scale above 1').toBeGreaterThan(1)
    expect(middle.scale, 'premise: a scale below 1.25').toBeLessThan(1.25)
    await follows('the middle layout')

    await page.setViewportSize({ width: 320, height: 760 })
    const phone = await follows('the phone')
    expect(phone.scale, 'no scale on the phone').toBeNull()

    await page.setViewportSize({ width: 900, height: 760 })
    const back = await follows('widened back')
    expect(back.scale, 'the scale again').toBeGreaterThan(1)
  })
})

test.describe(() => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('the panel fits the slot where the scale is at its cap', async ({ join, voters }) => {
    const { page } = await join('Bob', { role: 'Facilitator' })
    await voters(['Ann', 'Ben'])
    await expect(nameLine(page, 'No vote'), 'premise: one line').toBeVisible()
    const cap = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement)
      return parseFloat(root.getPropertyValue('--deck-card')) / parseFloat(root.getPropertyValue('--entry-mark'))
    })
    const { scale } = await panelSizes(page)
    expect(Math.abs(scale - cap), `premise: the scale ${scale} at its cap ${cap}`).toBeLessThan(0.02)
    const slot = await progressRegion(page).evaluate(region => {
      const style = getComputedStyle(region)
      const top = region.firstElementChild.getBoundingClientRect().top
      const bottom = region.lastElementChild.getBoundingClientRect().bottom
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
      const height = region.closest('[data-testid="round-slot"]').getBoundingClientRect().height
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
      const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--progress-bar')) * rem
      const drawn = region.querySelector('.progress-bar').getBoundingClientRect().height
      return { height, content: bottom - top + padding, bar, drawn }
    })
    expect(slot.content, `the panel within the slot, ${JSON.stringify(slot)}`).toBeLessThanOrEqual(slot.height)
    // The column would squash the empty bar rather than overflow.
    expect(Math.abs(slot.drawn - slot.bar), `the bar at its full height, ${JSON.stringify(slot)}`).toBeLessThanOrEqual(0.5)
  })

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
