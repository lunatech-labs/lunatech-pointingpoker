import {
  test,
  expect,
  card,
  changeDefaultRole,
  deck,
  defaultRoleChoice,
  defaultRoleLine,
  defaultRoleRadio,
  expectSummaryMatchesParticipants,
  facilitatorMark,
  frozenNotice,
  nameInput,
  ownEstimation,
  participantEntry,
  results,
  revealedEstimation,
  roomIdInput,
  switchTo,
  tallyEntries,
  unconfirmedCard,
  vote,
  votedMark
} from './fixtures.js'

const ROOM_URL = /\/[a-z]+-[a-z]+-[a-z]+$/
// In the room, with the role the join sent: each role line offers the other role.
const joinedAs = (page, role) =>
  expect(switchTo(page, role === 'Facilitator' ? 'voter' : 'facilitator')).toBeVisible()

// Through the role line, then seen by another page, so the switch has landed when this returns.
const becomeFacilitator = async (who, watcher) => {
  await switchTo(who.page, 'facilitator').click()
  await expect(switchTo(who.page, 'voter')).toBeVisible()
  await expect(facilitatorMark(participantEntry(watcher.page, who.name))).toHaveCount(1)
}

test('a room with a facilitator auto-reveals when the voters finish', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const carol = await join('Carol')
  await becomeFacilitator(alice, bob)

  await vote(bob.page, '3')
  await vote(carol.page, '5')
  await expect(results(alice.page)).toBeVisible()
  await expect(revealedEstimation(participantEntry(alice.page, 'Bob'))).toHaveText('3')
  await expect(revealedEstimation(participantEntry(alice.page, 'Carol'))).toHaveText('5')
})

test('the last waiting voter switching to facilitator reveals the round', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  await vote(alice.page, '5')
  await expect(votedMark(participantEntry(bob.page, 'Alice'))).toHaveCount(1)
  await expect(results(bob.page)).toBeHidden()

  await becomeFacilitator(bob, alice)
  await expect(results(alice.page)).toBeVisible()
  await expect(revealedEstimation(participantEntry(alice.page, 'Alice'))).toHaveText('5')
})

test('a switch to facilitator drops the vote from the results', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  await vote(alice.page, '3')
  await vote(bob.page, '8')
  await expect(tallyEntries(alice.page)).toHaveCount(2)

  await becomeFacilitator(bob, alice)
  await expect(tallyEntries(alice.page)).toHaveCount(1)
  await expect(revealedEstimation(participantEntry(alice.page, 'Bob'))).toHaveText('')
  await expectSummaryMatchesParticipants(alice.page)

  // Switching back starts with no estimate, and the round stays revealed.
  await switchTo(bob.page, 'voter').click()
  await expect(deck(bob.page)).toBeVisible()
  await expect(ownEstimation(bob.page)).toHaveCount(0)
  await expect(card(bob.page, '8')).toBeDisabled()
})

test("a facilitator's page has no deck, and keeps Show, Re-vote and Clear", async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  await becomeFacilitator(alice, bob)
  await expect(deck(alice.page)).toHaveCount(0)

  await vote(bob.page, '5')
  // Bob is the only voter, so his vote reveals; Re-vote then reopens it for the Show below.
  await expect(frozenNotice(bob.page)).toBeVisible()
  await expect(frozenNotice(alice.page)).toHaveCount(0)
  await alice.page.getByRole('button', { name: 'Re-vote' }).click()
  await expect(unconfirmedCard(bob.page)).toHaveText('5')
  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await expect(frozenNotice(bob.page)).toBeVisible()
  await alice.page.getByRole('button', { name: 'Clear votes' }).click()
  await expect(frozenNotice(bob.page)).toBeHidden()
  await expect(ownEstimation(bob.page)).toHaveCount(0)
  await expect(deck(alice.page)).toHaveCount(0)
})

// The spec's one-button rule: a restyle rendering one button per role would drop focus.
test('a switch keeps keyboard focus on its one button', async ({ join }) => {
  const alice = await join('Alice')
  await switchTo(alice.page, 'facilitator').focus()
  await alice.page.keyboard.press('Enter')
  await expect(switchTo(alice.page, 'voter')).toBeFocused()
})

// Spelled out, since a dblclick usually lands both clicks before the switch's frame.
test("a double-click's second click does not switch back", async ({ join, room }) => {
  const alice = await join('Alice')
  const switches = []
  alice.page.on('request', r => r.url().endsWith(`/rooms/${room}/role`) && switches.push(r))
  await switchTo(alice.page, 'facilitator').click()
  await joinedAs(alice.page, 'Facilitator')

  const box = await switchTo(alice.page, 'voter').boundingBox()
  await alice.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await alice.page.mouse.down({ clickCount: 2 })
  await alice.page.mouse.up({ clickCount: 2 })
  // The click handler posts at once, so a second switch would have been seen by now.
  await alice.page.waitForTimeout(500)
  expect(switches).toHaveLength(1)
  await joinedAs(alice.page, 'Facilitator')
})

test('a facilitator stays one across a reload', async ({ join }) => {
  const alice = await join('Alice', { role: 'Facilitator' })
  const bob = await join('Bob')
  await expect(facilitatorMark(participantEntry(bob.page, 'Alice'))).toHaveCount(1)

  await alice.page.reload()
  await joinedAs(alice.page, 'Facilitator')
  await expect(deck(alice.page)).toHaveCount(0)
  await expect(facilitatorMark(participantEntry(bob.page, 'Alice'))).toHaveCount(1)
})

test('a regular user from before roles gets the lobby on Voter, and joins on Join', async ({
  visitor,
  room
}) => {
  const page = await visitor({ name: 'Alice' })
  const joins = []
  page.on('request', request => request.url().endsWith('/join') && joins.push(request.url()))
  await page.goto(`/${room}`)
  await expect(nameInput(page)).toHaveValue('Alice')
  await expect(defaultRoleRadio(page, 'Voter')).toBeChecked()
  // A page that joined on its own would have sent its join by now.
  await page.waitForLoadState('networkidle')
  expect(joins).toEqual([])

  await page.getByRole('button', { name: 'Join' }).click()
  await joinedAs(page, 'Voter')
})

test('a legacy link with no default role asks for one, joins with it, then joins at once', async ({
  visitor
}) => {
  const legacy = crypto.randomUUID()
  const page = await visitor({ name: 'Alice' })
  await page.goto(`/${legacy}`)
  await expect(page).toHaveURL(ROOM_URL)
  await defaultRoleRadio(page, 'Facilitator').check()
  await page.getByRole('button', { name: 'Join' }).click()
  await joinedAs(page, 'Facilitator')

  await page.goto(`/${legacy}`)
  await joinedAs(page, 'Facilitator')
})

test("with default Voter, a Join at the root takes the room's remembered Facilitator", async ({
  visitor,
  room
}) => {
  const page = await visitor({
    name: 'Alice',
    defaultRole: 'Voter',
    [`role:${room}`]: 'Facilitator'
  })
  await page.goto('/')
  await page.getByRole('link', { name: 'Join' }).click()
  await roomIdInput(page).fill(room)
  await page.getByRole('button', { name: 'Join' }).click()
  await joinedAs(page, 'Facilitator')
})

test("with default Voter, a legacy link takes its slug's remembered Facilitator", async ({
  visitor,
  request,
  origin
}) => {
  const legacy = crypto.randomUUID()
  // The derived slug, read off the redirect, since the key is the id the page loads.
  const redirect = await request.get(`${origin}/${legacy}`, { maxRedirects: 0 })
  const slug = new URL(redirect.headers().location, origin).pathname.slice(1)
  const page = await visitor({
    name: 'Alice',
    defaultRole: 'Voter',
    [`role:${slug}`]: 'Facilitator'
  })
  await page.goto(`/${legacy}`)
  await expect(page).toHaveURL(new RegExp(`/${slug}$`))
  await joinedAs(page, 'Facilitator')
})

test('a choice after Change is stored without a submit, and a new room takes it', async ({
  visitor
}) => {
  const page = await visitor({ name: 'Alice', defaultRole: 'Voter' })
  await page.goto('/')
  await expect(defaultRoleLine(page, 'Voter')).toBeVisible()
  await changeDefaultRole(page).click()
  await expect(defaultRoleRadio(page, 'Voter')).toBeChecked()
  await defaultRoleRadio(page, 'Facilitator').check()

  await page.reload()
  await expect(defaultRoleLine(page, 'Facilitator')).toBeVisible()
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(ROOM_URL)
  await joinedAs(page, 'Facilitator')
})

test('Change moves keyboard focus to the checked radio', async ({ visitor }) => {
  const page = await visitor({ name: 'Alice', defaultRole: 'Facilitator' })
  await page.goto('/')
  await changeDefaultRole(page).focus()
  await page.keyboard.press('Enter')
  await expect(defaultRoleRadio(page, 'Facilitator')).toBeFocused()
})

test('Change shows the default another tab stored after this page loaded', async ({ visitor }) => {
  const page = await visitor({ name: 'Alice', defaultRole: 'Voter' })
  await page.goto('/')
  await expect(defaultRoleLine(page, 'Voter')).toBeVisible()
  const other = await page.context().newPage()
  await other.goto('/')
  await changeDefaultRole(other).click()
  await defaultRoleRadio(other, 'Facilitator').check()

  await changeDefaultRole(page).click()
  await expect(defaultRoleRadio(page, 'Facilitator')).toBeChecked()
})

test("a revisit takes the role the room's snapshot stored, not a default changed since", async ({
  visitor,
  room
}) => {
  const page = await visitor({ name: 'Alice', defaultRole: 'Facilitator' })
  await page.goto(`/${room}`)
  await joinedAs(page, 'Facilitator')

  await page.goto('/')
  await changeDefaultRole(page).click()
  await defaultRoleRadio(page, 'Voter').check()
  await page.goto(`/${room}`)
  await joinedAs(page, 'Facilitator')
})

test('a malformed default role reaches the lobby, and a submit keeping Voter stores it', async ({
  visitor,
  room
}) => {
  const page = await visitor({ defaultRole: 'facilitator' })
  await page.goto(`/${room}`)
  await expect(defaultRoleRadio(page, 'Voter')).toBeChecked()
  await nameInput(page).fill('Alice')
  await page.getByRole('button', { name: 'Join' }).click()
  await joinedAs(page, 'Voter')

  await page.reload()
  await joinedAs(page, 'Voter')
})

test("a first-visit tab keeps its form, and another's submit keeps the choice it made", async ({
  visitor
}) => {
  const first = await visitor()
  const second = await first.context().newPage()
  await first.goto('/')
  await second.goto('/')
  await defaultRoleRadio(first, 'Facilitator').check()
  await expect(defaultRoleChoice(first)).toBeVisible()
  await expect(defaultRoleRadio(second, 'Voter')).toBeChecked()

  await nameInput(second).fill('Alice')
  await second.getByRole('button', { name: 'Create' }).click()
  await expect(second.getByRole('button', { name: 'Show votes' })).toBeVisible()
  const later = await first.context().newPage()
  await later.goto('/')
  await expect(defaultRoleLine(later, 'Facilitator')).toBeVisible()
})

test("Create forgets a reused slug's remembered role and joins with the default", async ({
  visitor,
  room
}) => {
  const page = await visitor({
    name: 'Alice',
    defaultRole: 'Facilitator',
    [`role:${room}`]: 'Voter'
  })
  // As if the server drew a slug this browser remembers from a room since forgotten.
  await page.route('**/create-room', route => route.fulfill({ status: 200, body: room }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(new RegExp(`/${room}$`))
  await joinedAs(page, 'Facilitator')
})

test('a failed switch changes neither the line nor the role a reload joins with', async ({
  join,
  room
}) => {
  const alice = await join('Alice')
  const role = new RegExp(`/rooms/${room}/role$`)
  await alice.page.route(role, route => route.abort())
  // Logged after any write the failure made, so the reload below sees it.
  const logged = alice.page.waitForEvent('console', m => m.type() === 'log')
  await switchTo(alice.page, 'facilitator').click()
  await logged
  await joinedAs(alice.page, 'Voter')

  await alice.page.unroute(role)
  await alice.page.reload()
  await joinedAs(alice.page, 'Voter')
})

test('a switch survives a reload while the stream is frozen', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  await bob.freeze()
  const switched = bob.page.waitForResponse(r => r.url().endsWith('/role') && r.status() === 204)
  await switchTo(bob.page, 'facilitator').click()
  // A 204 has no body, so the page acts on it as the headers land.
  await switched
  await expect(facilitatorMark(participantEntry(alice.page, 'Bob'))).toHaveCount(1)
  // Frozen, so only the 204 told Bob's page.
  await expect(switchTo(bob.page, 'facilitator')).toBeVisible()

  await bob.page.reload()
  await joinedAs(bob.page, 'Facilitator')
  await expect(facilitatorMark(participantEntry(alice.page, 'Bob'))).toHaveCount(1)
})

test("a switch in one room changes neither another room's role nor the default", async ({
  visitor,
  room,
  app
}) => {
  const response = await fetch(`${app.baseUrl}/create-room`, { method: 'POST' })
  const other = (await response.text()).trim()
  const page = await visitor({ name: 'Alice', defaultRole: 'Voter' })
  await page.goto(`/${other}`)
  await joinedAs(page, 'Voter')

  await page.goto(`/${room}`)
  await switchTo(page, 'facilitator').click()
  await joinedAs(page, 'Facilitator')
  await page.reload()
  await joinedAs(page, 'Facilitator')

  // The default first: the other room's own snapshot would write over a stray write to it.
  await page.goto('/')
  await expect(defaultRoleLine(page, 'Voter')).toBeVisible()
  await page.goto(`/${other}`)
  await joinedAs(page, 'Voter')
})
