import {
  test,
  expect,
  ISSUE_240,
  checkEstimate,
  estimateRadio,
  estimateRow,
  historyPanel,
  historyRows,
  historyToggle,
  issuePanel,
  nextButton,
  nextDialog,
  nextField,
  nextSubmit,
  participantEntry,
  readBoxes,
  recordRounds,
  roundBar,
  setIssue,
  table,
  vote,
  votedMark
} from './fixtures.js'

const PHONE = { width: 392, height: 800 }
const DESKTOP = { width: 1280, height: 680 }

test.use({ viewport: DESKTOP })

const historyList = page => historyPanel(page).getByRole('list')

// Reveals the round from the page and waits out the guard, which drops a press on Next issue.
const reveal = async page => {
  await roundBar(page).getByRole('button', { name: 'Show votes' }).click()
  await expect(nextButton(page)).not.toHaveAttribute('aria-disabled')
}

// Moves the room on through the dialog, with the choice given, to the next issue given.
const moveOn = async (page, choice, issue) => {
  await reveal(page)
  await nextButton(page).click()
  if (choice) await checkEstimate(page, choice)
  await nextField(page).fill(issue)
  await nextSubmit(page).click()
  await expect(nextDialog(page)).toBeHidden()
}

// The list's last row lies within the list's box, so it is in view.
const expectLastInView = async page => {
  const { boxes } = await readBoxes(page, { list: historyList(page), last: historyRows(page).last() })
  const { list, last } = boxes
  expect(last.y, 'the last row under the list top').toBeGreaterThanOrEqual(list.y - 0.5)
  const bottom = list.y + list.height + 0.5
  expect(last.y + last.height, 'the last row above the list bottom').toBeLessThanOrEqual(bottom)
}

// The list's height and --row-height, in px.
const heights = list =>
  list.evaluate(el => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
    const row = rem * parseFloat(getComputedStyle(el).getPropertyValue('--row-height'))
    return { list: el.getBoundingClientRect().height, row }
  })

test('recording shows the history on every page', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  await setIssue(alice.page, 'PP-1')
  for (const page of [alice.page, bob.page]) await expect(historyPanel(page)).toHaveCount(0)

  await vote(bob.page, '?')
  await expect(votedMark(participantEntry(alice.page, 'Bob'))).toHaveCount(1)
  await reveal(alice.page)
  await nextButton(alice.page).click()
  await expect(estimateRadio(alice.page, '?')).toBeChecked()
  await nextField(alice.page).fill('')
  await nextSubmit(alice.page).click()
  await expect(nextDialog(alice.page)).toBeHidden()

  await reveal(alice.page)
  await nextButton(alice.page).click()
  await expect(estimateRow(alice.page)).toHaveAccessibleName('Estimate for Round 2')
  await checkEstimate(alice.page, 'Unsettled')
  await nextField(alice.page).fill('PP-3')
  await nextSubmit(alice.page).click()
  await expect(nextDialog(alice.page)).toBeHidden()

  await moveOn(alice.page, 'Skip', 'PP-4')

  const carol = await join('Carol')
  for (const page of [alice.page, bob.page, carol.page]) {
    await expect(historyPanel(page)).toHaveAccessibleName('Rounds · 2')
    await expect(historyRows(page)).toHaveText(['PP-1 ?', 'Round 2 Unsettled'])
    const weights = await historyRows(page).evaluateAll(rows =>
      rows.map(row => Number(getComputedStyle(row).fontWeight))
    )
    expect(weights[0], 'the earlier row').toBeLessThan(600)
    expect(weights[1], 'the latest row').toBeGreaterThanOrEqual(600)
    await expect(historyPanel(page).locator('[title]')).toHaveCount(0)
  }
})

test('an issue edited while the dialog is open is the one recorded', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  await setIssue(alice.page, 'PP-1')
  await reveal(alice.page)
  await nextButton(alice.page).click()

  await setIssue(bob.page, 'PP-1b')
  await expect(estimateRow(alice.page)).toHaveAccessibleName('Estimate for PP-1b')
  await checkEstimate(alice.page, '3')
  await nextField(alice.page).fill('PP-2')
  await nextSubmit(alice.page).click()
  await expect(nextDialog(alice.page)).toBeHidden()

  await expect(historyRows(alice.page)).toHaveText(['PP-1b 3'])
})

test('the list grows with its entries', async ({ join, room }) => {
  const { page } = await join('Alice')
  await recordRounds(page, room, 1, ['PP-2', 'PP-3'])
  await expect(historyRows(page)).toHaveCount(2)
  const desktop = await heights(historyList(page))
  expect(Math.abs(desktop.list - 2 * desktop.row), 'two rows on desktop').toBeLessThanOrEqual(0.5)
  await expect(historyToggle(page)).toHaveCount(0)

  await page.setViewportSize(PHONE)
  await historyToggle(page).click()
  await expect(historyToggle(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(historyRows(page)).toHaveCount(2)
  const phone = await heights(historyList(page))
  expect(Math.abs(phone.list - 2 * phone.row), 'two rows opened on the phone').toBeLessThanOrEqual(0.5)
})

test.describe(() => {
  test.use({ viewport: PHONE })

  test('the phone panel', async ({ join, room }) => {
    const { page } = await join('Alice')
    await recordRounds(page, room, 1, ['PP-2'])
    await expect(historyRows(page)).toHaveText(['Round 1 3'])
    const { boxes } = await readBoxes(page, {
      issue: issuePanel(page),
      panel: historyPanel(page),
      table: table(page)
    })
    expect(boxes.panel.y, 'the panel under the issue').toBeGreaterThanOrEqual(boxes.issue.y + boxes.issue.height)
    expect(boxes.table.y, 'the table under the panel').toBeGreaterThanOrEqual(boxes.panel.y + boxes.panel.height)
    await expect(historyToggle(page)).toHaveCount(0)

    await recordRounds(page, room, 2, ['PP-3'])
    await expect(historyRows(page)).toHaveText(['PP-2 3'])
    await expect(historyToggle(page)).toHaveText('Show more')
    await expect(historyToggle(page)).toHaveAttribute('aria-expanded', 'false')

    await historyToggle(page).click()
    await expect(historyRows(page)).toHaveText(['Round 1 3', 'PP-2 3'])
    await expect(historyToggle(page)).toHaveText('Show less')
    await expect(historyToggle(page)).toHaveAttribute('aria-expanded', 'true')

    await recordRounds(page, room, 3, ['PP-4'])
    await expect(historyRows(page)).toHaveText(['Round 1 3', 'PP-2 3', 'PP-3 3'])
    await expect(historyToggle(page)).toHaveAttribute('aria-expanded', 'true')
    await expectLastInView(page)

    // A fourth entry overflows the opened list, which stays 3 rows tall with its end in view.
    await recordRounds(page, room, 4, ['PP-5'])
    await expect(historyRows(page)).toHaveCount(4)
    const opened = await heights(historyList(page))
    expect(Math.abs(opened.list - 3 * opened.row), 'three rows opened').toBeLessThanOrEqual(0.5)
    await expectLastInView(page)

    await historyToggle(page).click()
    await expect(historyRows(page)).toHaveText(['PP-4 3'])
    await historyToggle(page).click()
    await expect(historyRows(page)).toHaveCount(4)
    await expectLastInView(page)

    await historyToggle(page).click()
    await expect(historyRows(page)).toHaveText(['PP-4 3'])
    await expect(historyToggle(page)).toHaveText('Show more')
  })

  test('crossing from the phone layout shows the latest row', async ({ join, room }) => {
    const { page } = await join('Alice')
    await recordRounds(page, room, 1, ['PP-2', 'PP-3', 'PP-4', 'PP-5', 'PP-6', 'PP-7'])
    await expect(historyRows(page)).toHaveText(['PP-6 3'])
    await expect(historyToggle(page)).toHaveAttribute('aria-expanded', 'false')

    await page.setViewportSize(DESKTOP)
    await expect(historyRows(page)).toHaveCount(6)
    await expectLastInView(page)
  })
})

test('the list stays where it was read, and moves to the end for a new entry', async ({ join, room }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  await recordRounds(alice.page, room, 1, ['PP-2', 'PP-3', 'PP-4', 'PP-5', 'PP-6', 'PP-7'])
  await expect(historyRows(alice.page)).toHaveCount(6)
  const list = historyList(alice.page)
  expect(await list.evaluate(el => el.scrollHeight > el.clientHeight), 'more rows than shown').toBe(true)
  await list.evaluate(el => (el.scrollTop = 0))

  await vote(bob.page, '5')
  await expect(votedMark(participantEntry(alice.page, 'Bob'))).toHaveCount(1)
  expect(await list.evaluate(el => el.scrollTop), 'the scroll after a vote').toBe(0)

  await recordRounds(alice.page, room, 7, ['PP-8'])
  await expect(historyRows(alice.page)).toHaveCount(7)
  await expectLastInView(alice.page)
})

test('a link row keeps its end, a text row its start', async ({ join, room }) => {
  const { page } = await join('Alice')
  const jira = 'https://acme.atlassian.net/jira/software/projects/PP/boards/3?selectedIssue=PP-77'
  // The sidebar's cell is too narrow at 1280 wide for the GitHub link to fit.
  const short = 'https://example.com/ticket'
  const words = `https://github.com/acme/web/issues/412 and the words that follow it, ${ISSUE_240}`
  const text = words.slice(0, ISSUE_240.length)
  await recordRounds(page, room, 1, [jira, short, text, 'PP-9'])
  await expect(historyRows(page)).toHaveCount(4)

  // Each row's issue cell, its bdi and its text's first line box, after the fonts and two frames.
  const read = row =>
    row.evaluate(async li => {
      await document.fonts.ready
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const cell = li.firstElementChild
      const bdi = cell.querySelector('bdi')?.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(cell)
      const first = range.getClientRects()[0]
      const { left, right } = cell.getBoundingClientRect()
      return {
        cell: { left, right },
        bdi: bdi && { left: bdi.left, right: bdi.right },
        first: first.left,
        cut: cell.scrollWidth > cell.clientWidth
      }
    })
  const long = await read(historyRows(page).nth(1))
  expect(Math.abs(long.bdi.right - long.cell.right), "the long link's end at the cell's").toBeLessThanOrEqual(0.5)
  expect(long.bdi.left, "the long link's start cut off").toBeLessThan(long.cell.left)
  const fits = await read(historyRows(page).nth(2))
  expect(Math.abs(fits.bdi.left - fits.cell.left), "the short link at the cell's left").toBeLessThanOrEqual(0.5)
  const cut = await read(historyRows(page).nth(3))
  expect(cut.bdi, 'a text row has no bdi').toBeUndefined()
  expect(Math.abs(cut.first - cut.cell.left), "the text's start at the cell's left").toBeLessThanOrEqual(0.5)
  expect(cut.cut, 'the text cut at its end').toBe(true)
})
