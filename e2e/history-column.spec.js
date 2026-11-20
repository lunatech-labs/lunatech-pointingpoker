import { test, expect, historyList, historyRows, recordRounds } from './fixtures.js'

// Its own file: launchOptions force a new worker, which Playwright allows only at a file's top level.
// Headless Chromium hides scrollbars unless told not to, and a hidden one takes no room (round history amendment plan, ruling 10).
test.use({ viewport: { width: 1280, height: 680 }, launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

const estimate = value => ({ type: 'Estimate', value })

// Each row's issue end, weight and content box, its outcome slot and the slot's text, after the fonts and two frames.
const readRows = list =>
  list.evaluate(async ol => {
    await document.fonts.ready
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const content = el => {
      const { left, right, height } = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      const start = left + parseFloat(style.paddingLeft)
      const end = right - parseFloat(style.paddingRight)
      return { left: start, right: end, width: end - start, height }
    }
    return [...ol.children].map(li => {
      const [issue, slot] = li.children
      const range = document.createRange()
      range.selectNodeContents(slot)
      const text = range.getBoundingClientRect()
      const { width, height } = slot.getBoundingClientRect()
      return {
        end: issue.getBoundingClientRect().right,
        weight: getComputedStyle(li).fontWeight,
        row: content(li),
        slot: { width, height, content: content(slot), cut: slot.scrollWidth > slot.clientWidth },
        text: { left: text.left, right: text.right }
      }
    })
  })

// Every row's issue cell ends at x0, so the outcomes share one column.
const expectOneColumn = (rows, x0, label) => {
  for (const [i, row] of rows.entries())
    expect(Math.abs(row.end - x0), `${label}: row ${i + 1}'s issue ends at ${row.end}, not ${x0}`).toBeLessThanOrEqual(0.5)
}

test('the outcomes form one column', async ({ join, room }) => {
  const { page } = await join('Alice')
  const list = historyList(page)
  await recordRounds(page, room, 1, ['PP-2', 'PP-3', 'PP-4'], ['3', '13', '0.5'].map(estimate))
  await expect(historyRows(page)).toHaveCount(3)
  const estimates = await readRows(list)
  const x0 = estimates[0].end
  expectOneColumn(estimates, x0, 'the estimates')

  await recordRounds(page, room, 4, ['PP-5'], [{ type: 'Parked' }])
  await expect(historyRows(page).last()).toHaveText('PP-4 Parked')
  const parked = await readRows(list)
  // Review Focus 1: the 0.5's tight point, as Parked, whole within its slot.
  for (const [i, { slot, text }] of parked.entries()) {
    expect(text.left, `row ${i + 1}'s start within its slot`).toBeGreaterThanOrEqual(slot.content.left - 0.5)
    expect(text.right, `row ${i + 1}'s end within its slot`).toBeLessThanOrEqual(slot.content.right + 0.5)
  }
  expectOneColumn(parked, x0, 'with Parked')

  await recordRounds(page, room, 5, ['PP-6', 'PP-7'], ['5', '5'].map(estimate))
  await expect(historyRows(page)).toHaveCount(6)
  expect(await list.evaluate(el => el.scrollHeight > el.clientHeight), 'the list scrolls').toBe(true)
  const scrolled = await readRows(list)
  expectOneColumn(scrolled, x0, 'with the list scrolling')
  expect(scrolled.map(row => row.weight), 'the latest row bold').toEqual([...Array(5).fill('400'), '700'])
  expect(await list.ariaSnapshot(), 'each row its issue and its outcome only').toBe(
    [
      '- list "Rounds · 6":',
      '  - listitem: Round 1 3',
      '  - listitem: PP-2 13',
      '  - listitem: PP-3 0.5',
      '  - listitem: PP-4 Parked',
      '  - listitem: PP-5 5',
      '  - listitem: PP-6 5'
    ].join('\n')
  )
})

test('an off-deck value widens the column up to its cap', async ({ join, room }) => {
  const { page } = await join('Alice')
  const list = historyList(page)
  await recordRounds(page, room, 1, ['PP-2'])
  await expect(historyRows(page)).toHaveCount(1)
  const w0 = (await readRows(list))[0].slot.width

  await recordRounds(page, room, 2, ['PP-3'], [estimate('1000000')])
  await expect(historyRows(page)).toHaveCount(2)
  const whole = (await readRows(list)).at(-1)
  expect(whole.slot.cut, 'a million shown whole').toBe(false)
  expect(whole.slot.width, 'the column widened').toBeGreaterThan(w0)

  await recordRounds(page, room, 3, ['PP-4'], [estimate('W'.repeat(30))])
  await expect(historyRows(page)).toHaveCount(3)
  const { row, slot, text } = (await readRows(list)).at(-1)
  expect(slot.height, 'one line').toBeLessThanOrEqual(row.height + 0.5)
  expect(Math.abs(text.left - slot.content.left), "its start at the slot's left").toBeLessThanOrEqual(0.5)
  expect(slot.cut, 'its end cut').toBe(true)
  expect(slot.width, 'at most 40% of the row').toBeLessThanOrEqual(0.4 * row.width + 0.5)
})
