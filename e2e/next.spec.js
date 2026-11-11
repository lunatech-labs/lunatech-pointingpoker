import {
  test,
  expect,
  issueBox,
  issueEdit,
  issuePanel,
  issueText,
  nextButton,
  nextCancel,
  nextDialog,
  nextField,
  nextStatus,
  nextSubmit,
  noVoteMark,
  participantEntry,
  phaseWord,
  restartNotice,
  revealedEstimation,
  roundBar,
  setIssue,
  vote,
  votedMark
} from './fixtures.js'

test('an open issue editor shows the notice once the room moves on, and OK puts focus on Edit', async ({
  join,
  room
}) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const panel = issuePanel(alice.page)

  await issueEdit(alice.page).click()
  await issueBox(alice.page).fill('mine')
  await bob.page.getByRole('button', { name: 'Show votes' }).click()
  const posted = await bob.page.request.post(`/rooms/${room}/next-issue`, {
    data: { round: 1, issue: 'PP-2' }
  })
  expect(posted.status()).toBe(204)

  await expect(panel.getByRole('status')).toHaveText('The room moved on to: "PP-2" OK')
  await expect(issueBox(alice.page)).toHaveCount(0)
  // The field held focus, so its text takes it and a keystroke meant for the form presses nothing.
  await expect(panel.getByText('The room moved on to: "PP-2"')).toBeFocused()

  await panel.getByRole('button', { name: 'OK' }).click()
  await expect(panel.getByRole('status')).toBeEmpty()
  await expect(issueText(alice.page)).toHaveText('PP-2')
  await expect(issueEdit(alice.page)).toBeFocused()
})

const showVotes = page => roundBar(page).getByRole('button', { name: 'Show votes' })
const nextIssueUrl = room => new RegExp(`/rooms/${room}/next-issue$`)

// The bodies of the next-issue requests a page sends; read only once a later frame has landed.
const nextSent = (page, room) => {
  const sent = []
  page.on('request', request => {
    if (nextIssueUrl(room).test(request.url())) sent.push(request.postDataJSON())
  })
  return sent
}

// Reveals the round from the page and waits out the guard, which drops a press on Next issue.
const reveal = async page => {
  await showVotes(page).click()
  await expect(nextButton(page)).not.toHaveAttribute('aria-disabled')
}

// Alice and Bob on PP-1, Bob's vote cast, the round revealed on Alice's page.
const revealedRound = async join => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  await setIssue(alice.page, 'PP-1')
  await vote(bob.page, '5')
  await expect(votedMark(participantEntry(alice.page, 'Bob'))).toHaveCount(1)
  await reveal(alice.page)
  return { alice, bob }
}

test('Next issue moves the room on', async ({ join, room }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  await setIssue(alice.page, 'PP-1')
  await vote(bob.page, '5')
  await expect(votedMark(participantEntry(alice.page, 'Bob'))).toHaveCount(1)
  await expect(nextButton(alice.page)).toHaveCount(0)

  await showVotes(alice.page).click()
  await expect(nextButton(alice.page)).toHaveAttribute('aria-disabled', 'true')
  await expect(nextButton(alice.page)).not.toHaveAttribute('aria-disabled')
  await nextButton(alice.page).click()
  await expect(nextField(alice.page)).toBeFocused()
  await expect(nextField(alice.page)).toHaveValue('PP-1')
  expect(await nextField(alice.page).evaluate(f => [f.selectionStart, f.selectionEnd])).toEqual([0, 4])

  await alice.page.keyboard.type('PP-2')
  await alice.page.keyboard.press('Enter')
  await expect(nextDialog(alice.page)).toBeHidden()
  for (const page of [alice.page, bob.page]) {
    await expect(issueText(page)).toHaveText('PP-2')
    await expect(phaseWord(page)).toHaveText('Voting')
    await expect(noVoteMark(participantEntry(page, 'Bob'))).toHaveCount(1)
  }
  await expect(showVotes(alice.page)).toBeFocused()

  // Again with the 204 held: the stream brings the room's move first, which is the page's own.
  const requests = []
  let release
  const held = new Promise(resolve => (release = resolve))
  await alice.page.route(nextIssueUrl(room), async route => {
    requests.push(route.request().postDataJSON())
    const response = await route.fetch()
    await held
    await route.fulfill({ response })
  })
  await reveal(alice.page)
  await nextButton(alice.page).click()
  await alice.page.keyboard.type('PP-3')
  await alice.page.keyboard.press('Enter')
  await expect(issueText(bob.page)).toHaveText('PP-3')
  await expect(issueText(alice.page)).toHaveText('PP-3')
  await expect(nextField(alice.page)).toBeVisible()
  await expect(nextStatus(alice.page)).toBeEmpty()
  await alice.page.keyboard.press('Enter')
  // Forced, since a plain click waits while the button is aria-disabled.
  await nextSubmit(alice.page).click({ force: true })
  await expect(nextStatus(alice.page)).toBeEmpty()

  release()
  await expect(nextDialog(alice.page)).toBeHidden()
  await expect(showVotes(alice.page)).toBeFocused()
  expect(requests).toEqual([{ round: 2, issue: 'PP-3' }])
})

test('Cancel and Escape change nothing', async ({ join, room }) => {
  const { alice, bob } = await revealedRound(join)
  const sent = nextSent(alice.page, room)

  await nextButton(alice.page).click()
  await alice.page.keyboard.type('nope')
  await nextCancel(alice.page).click()
  await expect(nextDialog(alice.page)).toBeHidden()
  await expect(nextButton(alice.page)).toBeFocused()

  await alice.page.keyboard.press('Enter')
  await expect(nextField(alice.page)).toBeFocused()
  await alice.page.keyboard.type('nope')
  await alice.page.keyboard.press('Escape')
  await expect(nextDialog(alice.page)).toBeHidden()
  await expect(nextButton(alice.page)).toBeFocused()

  // While sending, one Escape is prevented and the form stays read-only.
  let release
  const held = new Promise(resolve => (release = resolve))
  await alice.page.route(nextIssueUrl(room), async route => {
    await held
    await route.abort()
  })
  await nextButton(alice.page).click()
  // Escape's close reached Closed, so the reopen starts from the shown issue.
  await expect(nextField(alice.page)).toHaveValue('PP-1')
  await alice.page.keyboard.type('held')
  await alice.page.keyboard.press('Enter')
  await expect(nextField(alice.page)).toHaveJSProperty('readOnly', true)
  await alice.page.keyboard.press('Escape')
  await expect(nextDialog(alice.page)).toBeVisible()
  await expect(nextField(alice.page)).toHaveJSProperty('readOnly', true)
  await expect(nextSubmit(alice.page)).toHaveAttribute('aria-disabled', 'true')
  await expect(nextCancel(alice.page)).toHaveAttribute('aria-disabled', 'true')

  release()
  await expect(nextStatus(alice.page)).toHaveText('Could not move on to the next issue')
  for (const page of [alice.page, bob.page]) {
    await expect(issueText(page)).toHaveText('PP-1')
    await expect(phaseWord(page)).toHaveText('Revealed')
    await expect(revealedEstimation(participantEntry(page, 'Bob'))).toHaveText('5')
  }
  // Only the held request: Cancel and Escape sent none.
  expect(sent).toEqual([{ round: 1, issue: 'held' }])
})

test('a held Enter or a double-click on Next issue submits nothing', async ({ join, room }) => {
  const { alice, bob } = await revealedRound(join)
  const sent = nextSent(alice.page, room)

  await nextButton(alice.page).focus()
  await alice.page.keyboard.down('Enter')
  await expect(nextField(alice.page)).toBeFocused()
  // A down without an up is a repeat, sent where it would submit the pre-filled issue.
  await alice.page.keyboard.down('Enter')
  await alice.page.keyboard.down('Enter')
  await alice.page.keyboard.up('Enter')
  await setIssue(bob.page, 'PP-1b')
  await expect(issueText(alice.page)).toHaveText('PP-1b')
  await expect(nextDialog(alice.page)).toBeVisible()
  await expect(phaseWord(alice.page)).toHaveText('Revealed')

  await alice.page.keyboard.press('Escape')
  await expect(nextButton(alice.page)).toBeFocused()
  await nextButton(alice.page).dblclick()
  await setIssue(bob.page, 'PP-1c')
  await expect(issueText(alice.page)).toHaveText('PP-1c')
  await expect(nextDialog(alice.page)).toBeVisible()
  await expect(phaseWord(alice.page)).toHaveText('Revealed')
  await expect(nextField(alice.page)).toBeFocused()
  expect(sent).toEqual([])
})

test('a page that finds the room moved on shows the notice', async ({ join, room }) => {
  const alice = await join('Alice')
  const bob = await join('Bob', { role: 'Facilitator' })
  await setIssue(alice.page, 'PP-1')
  await reveal(alice.page)
  await nextButton(alice.page).click()
  await alice.page.keyboard.type('mine')

  // An edit within the round is no move: the field keeps what was typed.
  await setIssue(bob.page, 'PP-1b')
  await expect(issueText(alice.page)).toHaveText('PP-1b')
  await expect(nextField(alice.page)).toHaveValue('mine')
  await expect(nextStatus(alice.page)).toBeEmpty()

  const posted = await bob.page.request.post(`/rooms/${room}/next-issue`, {
    data: { round: 1, issue: 'PP-1b' }
  })
  expect(posted.status()).toBe(204)
  await expect(nextStatus(alice.page)).toHaveText('The room moved on to: "PP-1b" OK')
  await expect(nextField(alice.page)).toHaveCount(0)
  await expect(nextDialog(alice.page).getByText('The room moved on to: "PP-1b"')).toBeFocused()

  await nextDialog(alice.page).getByRole('button', { name: 'OK' }).click()
  await expect(nextDialog(alice.page)).toBeHidden()
  await expect(showVotes(alice.page)).toBeFocused()
})

test('a failed move keeps the text and says so', async ({ join, room }) => {
  const { alice } = await revealedRound(join)
  await alice.page.route(nextIssueUrl(room), route => route.abort())

  await nextButton(alice.page).click()
  await alice.page.keyboard.type('mine')
  await alice.page.keyboard.press('Enter')
  await expect(nextStatus(alice.page)).toHaveText('Could not move on to the next issue')
  await expect(nextField(alice.page)).toHaveValue('mine')
  await expect(nextField(alice.page)).toHaveJSProperty('readOnly', false)
  await expect(phaseWord(alice.page)).toHaveText('Revealed')
})

test('a 401 after the dialog closed reaches the restart notice', async ({ join, room }) => {
  const { alice } = await revealedRound(join)
  let release
  const held = new Promise(resolve => (release = resolve))
  await alice.page.route(nextIssueUrl(room), async route => {
    await held
    await route.fulfill({ status: 401 })
  })

  await nextButton(alice.page).click()
  await alice.page.keyboard.type('mine')
  await alice.page.keyboard.press('Enter')
  await expect(nextField(alice.page)).toHaveJSProperty('readOnly', true)
  // The browser lets a repeated Escape through: three in both browsers (Task 4's browser checks).
  for (let i = 0; i < 3 && (await nextDialog(alice.page).isVisible()); i++) {
    await alice.page.keyboard.press('Escape')
  }
  await expect(nextDialog(alice.page)).toBeHidden()

  release()
  await expect(restartNotice(alice.page)).toBeVisible({ timeout: 20_000 })
})

test('focus on Next issue moves to the toggle when the room moves on', async ({ join, room }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const panel = issuePanel(alice.page)
  await reveal(alice.page)
  await issueEdit(alice.page).click()
  await issueBox(alice.page).fill('mine')
  await nextButton(alice.page).focus()

  const posted = await bob.page.request.post(`/rooms/${room}/next-issue`, {
    data: { round: 1, issue: 'PP-2' }
  })
  expect(posted.status()).toBe(204)
  await expect(panel.getByRole('status')).toHaveText('The room moved on to: "PP-2" OK')
  await expect(showVotes(alice.page)).toBeFocused()
  // The notice takes focus only from what it replaces, and Next issue was not in the editor.
  await expect(panel.getByText('The room moved on to: "PP-2"')).not.toBeFocused()
})

// Holds the dialog's trusted close events, as a busy browser delays them, until released.
const holdCloseEvents = page =>
  page.evaluate(() => {
    window.heldCloses = []
    window.addEventListener(
      'close',
      e => {
        if (!e.isTrusted) return
        e.stopImmediatePropagation()
        window.heldCloses.push(e.target)
      },
      true
    )
  })
const releaseCloseEvents = page =>
  page.evaluate(() => window.heldCloses.splice(0).forEach(t => t.dispatchEvent(new Event('close'))))

test('a close event that lands after a reopen closes nothing', async ({ join }) => {
  const { alice } = await revealedRound(join)
  await holdCloseEvents(alice.page)

  for (const close of ['Cancel', 'Escape']) {
    await nextButton(alice.page).click()
    await alice.page.keyboard.type('nope')
    if (close === 'Cancel') await nextCancel(alice.page).click()
    else await alice.page.keyboard.press('Escape')
    await expect(nextDialog(alice.page)).toBeHidden()
    await nextButton(alice.page).click()
    await releaseCloseEvents(alice.page)
    await expect(nextDialog(alice.page), close).toBeVisible()
    await expect(nextField(alice.page), close).toBeFocused()
    // The reopen starts from the shown issue, not the closed one's text.
    await expect(nextField(alice.page), close).toHaveValue('PP-1')
    await alice.page.keyboard.press('Escape')
    await releaseCloseEvents(alice.page)
    await expect(nextDialog(alice.page)).toBeHidden()
  }
})
