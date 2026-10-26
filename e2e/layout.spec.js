import {
  test,
  expect,
  copyHint,
  expectLiveRegion,
  inRoom,
  issueBox,
  issueEdit,
  issueSave,
  issueText,
  markRegion,
  participantEntries,
  phaseLine,
  readBoxes,
  roundSlot,
  switchTo,
  tallyEntries,
  vote,
  votedMark
} from './fixtures.js'

// The floor and the comfort target of the wide layout (parent's step 4).
const floor = { width: 1280, height: 600 }
const comfort = { width: 1280, height: 680 }

// room.html's names: its first wraps, which the scales it measured and R10 rely on.
const NAMES = ['Alexandra Vasquez-Ferreira', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace',
  'Heidi', 'Ivan', 'Judy', 'Mallory', 'Niaj', 'Olivia', 'Rupert']
// Deck.tsx's estimationValues, so 13 voters give 13 distinct values.
const ESTIMATIONS = ['0', '0.5', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?']
// Two lines at 1280 px in both browsers, measured on room.html.
const TWO_LINES =
  'Rework the login page so that a returning user lands on their last room, and keep the room ' +
  'list in sync'
// room.html's 240 characters leave the table above its 5 rem, so three of them cut to 600.
const ISSUE_240 =
  'Rework the login page so that a returning user lands on their last room, and keep the room ' +
  'list in sync with the rooms they were invited to since their last visit, including the ' +
  'rooms that were renamed or archived meanwhile by a facilitator'
const LONG = [ISSUE_240, ISSUE_240, ISSUE_240].join('. ').slice(0, 600)

const table = page => page.getByRole('region', { name: 'Voters' })
const roundBar = page => page.getByRole('region', { name: 'Round' })
// The voters besides the page, which is one of them on the voter's page.
const others = (role, count) => (role === 'Voter' ? count - 1 : count)

// One case per viewport and page, each viewport its own group so test.use can set it.
const ROLES = ['Voter', 'Facilitator']
const cases = (title, { viewports = [floor, comfort], roles = ROLES }, body) => {
  for (const viewport of viewports) {
    for (const role of roles) {
      test.describe(() => {
        test.use({ viewport })
        const size = `${viewport.width} by ${viewport.height}`
        test(`${title}, ${size}, on the ${role.toLowerCase()}'s page`, async ({
          join,
          voters,
          room
        }) => body({ join, voters, room, role, viewport }))
      })
    }
  }
}

const fill = async (join, voters, role, count) => {
  const { page } = await join('Alice', { role })
  const joined = others(role, count) ? await voters(NAMES.slice(0, others(role, count))) : []
  await expect(participantEntries(page)).toHaveCount(count)
  return { page, joined }
}

const grow = async (page, voters, role, from, to) => {
  await voters(NAMES.slice(others(role, from), others(role, to)))
  await expect(participantEntries(page)).toHaveCount(to)
}

const setIssue = async (page, text) => {
  await issueEdit(page).click()
  await issueBox(page).fill(text)
  await issueSave(page).click()
  await expect(issueText(page)).toHaveText(text)
}

// The premise of the floor's cases: the issue's heading is two of PP-1's lines tall.
const setTwoLines = async page => {
  await setIssue(page, 'PP-1')
  const one = (await readBoxes(page, { issue: issueText(page) })).boxes.issue.height
  await setIssue(page, TWO_LINES)
  const two = (await readBoxes(page, { issue: issueText(page) })).boxes.issue.height
  expect(Math.round(two / one), `${two} px over ${one} px`).toBe(2)
}

// Every voter but the last protocol voter, so the round stays open; the page's value is distinct.
const voteAllButOne = async (page, role, joined) => {
  if (role === 'Voter') await vote(page, ESTIMATIONS[joined.length % 13])
  await Promise.all(joined.slice(0, -1).map((voter, i) => voter.vote(ESTIMATIONS[i % 13])))
  await expect(votedMark(table(page))).toHaveCount((role === 'Voter' ? 1 : 0) + joined.length - 1)
}

const voteLast = async (page, role, joined) => {
  await joined.at(-1).vote(ESTIMATIONS[(joined.length - 1) % 13])
  await expect(phaseLine(page)).toHaveText('Revealed')
  const count = joined.length + (role === 'Voter' ? 1 : 0)
  await expect(tallyEntries(page)).toHaveCount(Math.min(count, 13))
}

// The page's parts; the facilitator's page has no slot while voting.
const parts = (page, slotShown) => ({
  header: page.getByRole('banner'),
  issue: issueText(page),
  ...(slotShown && { slot: roundSlot(page) }),
  bar: roundBar(page),
  table: table(page)
})

const entries = (page, count) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`entry ${i}`, participantEntries(page).nth(i)])
  )

const within = (box, frame) =>
  box.x >= frame.x - 0.5 &&
  box.y >= frame.y - 0.5 &&
  box.x + box.width <= frame.x + frame.width + 0.5 &&
  box.y + box.height <= frame.y + frame.height + 0.5

// Each named box within the viewport, and within the table's box too when inTable says so.
const expectInView = (read, viewport, names, inTable = false) => {
  const frame = { x: 0, y: 0, ...viewport }
  const cut = names.filter(
    name =>
      !within(read.boxes[name], frame) || (inTable && !within(read.boxes[name], read.boxes.table))
  )
  expect(cut, JSON.stringify(read.boxes)).toEqual([])
}

// The boxes or fields of after that differ from before by more than half a pixel.
const moved = (before, after, fields = ['x', 'y', 'width', 'height']) =>
  Object.keys(before).flatMap(name =>
    fields
      .filter(field => Math.abs(after[name][field] - before[name][field]) > 0.5)
      .map(field => `${name}.${field}: ${before[name][field]} -> ${after[name][field]}`)
  )

const overlap = (a, b) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.5 &&
  Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.5

cases('no scroll at the floor', {}, async ({ join, voters, role, viewport }) => {
  const { page, joined } = await fill(join, voters, role, 14)
  await setTwoLines(page)
  await voteAllButOne(page, role, joined)
  const voting = await readBoxes(page, parts(page, role === 'Voter'))
  expect(voting.scrolls).toBe(0)
  expectInView(voting, viewport, Object.keys(voting.boxes))
  await voteLast(page, role, joined)
  const revealed = await readBoxes(page, parts(page, true))
  expect(revealed.scrolls).toBe(0)
  expectInView(revealed, viewport, Object.keys(revealed.boxes))
})

// R6: a one-line issue, as 3b1 measured; with the two-line one the mockup itself clips 7 of 14.
cases(
  'every entry in view at the comfort target',
  { viewports: [comfort] },
  async ({ join, voters, role, viewport }) => {
    const { page, joined } = await fill(join, voters, role, 14)
    await setIssue(page, 'PP-1')
    const read = () => readBoxes(page, { table: table(page), ...entries(page, 14) })
    await voteAllButOne(page, role, joined)
    const voting = await read()
    expectInView(voting, viewport, Object.keys(entries(page, 14)), true)
    await voteLast(page, role, joined)
    const revealed = await read()
    expectInView(revealed, viewport, Object.keys(entries(page, 14)), true)
  }
)

// The table keeps its 5 rem, and the slot and the round bar scroll wholly into view.
const scrollsAndCutsNothing = async (page, viewport, slotShown) => {
  const read = await readBoxes(page, parts(page, slotShown))
  expect(read.boxes.table.height).toBeGreaterThanOrEqual(5 * read.rem - 0.5)
  expect(read.scrolls).toBeGreaterThan(0)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const scrolled = await readBoxes(page, parts(page, slotShown))
  expectInView(scrolled, viewport, slotShown ? ['slot', 'bar'] : ['bar'])
  // In the slot's place, the table's top.
  if (!slotShown) expect(scrolled.boxes.table.y).toBeGreaterThanOrEqual(0)
}

cases(
  'a longer issue scrolls the page and cuts nothing',
  { viewports: [floor] },
  async ({ join, voters, role, viewport }) => {
    const { page, joined } = await fill(join, voters, role, 14)
    await setIssue(page, LONG)
    await voteAllButOne(page, role, joined)
    await scrollsAndCutsNothing(page, viewport, role === 'Voter')
    await voteLast(page, role, joined)
    await scrollsAndCutsNothing(page, viewport, true)
  }
)

cases(
  'a window below the floor scrolls the page and cuts nothing',
  { viewports: [{ width: 1280, height: 450 }] },
  async ({ join, voters, role, viewport }) => {
    const { page, joined } = await fill(join, voters, role, 14)
    await setTwoLines(page)
    await voteAllButOne(page, role, joined)
    await scrollsAndCutsNothing(page, viewport, role === 'Voter')
    await voteLast(page, role, joined)
    await scrollsAndCutsNothing(page, viewport, true)
  }
)

// R10: a room of 4 fits above 1 and below the cap at the floor, so a dropped reserve shows.
cases("the entries' scale holds through a reveal", {}, async ({ join, voters, role }) => {
  const { page, joined } = await fill(join, voters, role, 4)
  const first = async () =>
    (await readBoxes(page, { first: participantEntries(page).first() })).boxes.first.width
  await voteAllButOne(page, role, joined)
  const voting = await first()
  await voteLast(page, role, joined)
  expect(Math.abs((await first()) - voting), `voting at ${voting} px`).toBeLessThanOrEqual(0.5)
})

cases('a room of 1 is drawn larger than a room of 14', {}, async ({ join, voters, role }) => {
  const { page } = await fill(join, voters, role, 1)
  const first = async () =>
    (await readBoxes(page, { first: participantEntries(page).first() })).boxes.first.width
  const alone = await first()
  await grow(page, voters, role, 1, 14)
  expect(alone).toBeGreaterThan((await first()) + 1)
})

cases("an entry's card never passes a deck card's height", {}, async ({ join, voters, role }) => {
  const { page } = await fill(join, voters, role, 1)
  const read = await readBoxes(page, { card: participantEntries(page).first().getByRole('img') })
  expect(read.boxes.card.height).toBeLessThanOrEqual(5.5 * read.rem + 0.5)
})

cases(
  'a room of 0 voters is fitted',
  { roles: ['Facilitator'] },
  async ({ join, voters, role }) => {
    // A throw in the first fit unmounts the room, so join's wait for the marker fails first.
    const { page } = await fill(join, voters, role, 0)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await expect(table(page).getByRole('heading', { name: 'Voters · 0' })).toBeVisible()
    await readBoxes(page, { table: table(page) })
    await expect(inRoom(page)).toBeVisible()
    expect(errors).toEqual([])
  }
)

// Its text and tally stay with 'a Show in a room where nobody voted renders no summary'.
cases(
  'nobody voted: the slot keeps its height through a reveal',
  {},
  async ({ join, voters, role }) => {
    const { page } = await fill(join, voters, role, 14)
    const voter = role === 'Voter'
    const watched = voter ? { slot: roundSlot(page) } : { bar: roundBar(page), table: table(page) }
    const read = () => readBoxes(page, watched)
    const before = await read()
    await page.getByRole('button', { name: 'Show votes' }).click()
    await expect(phaseLine(page)).toHaveText('Revealed')
    await expect(roundSlot(page)).toContainText('Nobody voted')
    const after = await read()
    if (voter) expect(moved(before.boxes, after.boxes, ['height'])).toEqual([])
    else {
      expect(moved({ bar: before.boxes.bar }, after.boxes)).toEqual([])
      expect(moved({ table: before.boxes.table }, after.boxes, ['y'])).toEqual([])
    }
  }
)

cases(
  'nothing moves between a room of 2 and a room of 14',
  {},
  async ({ join, voters, role }) => {
    const { page } = await fill(join, voters, role, 2)
    const voter = role === 'Voter'
    const watched = {
      header: page.getByRole('banner'),
      issue: issueText(page),
      bar: roundBar(page),
      ...(voter ? { slot: roundSlot(page) } : { table: table(page) })
    }
    const { table: top, ...two } = (await readBoxes(page, watched)).boxes
    await grow(page, voters, role, 2, 14)
    const fourteen = (await readBoxes(page, watched)).boxes
    expect(moved(two, fourteen)).toEqual([])
    // In the slot's place, the table's top.
    if (!voter) expect(moved({ table: top }, fourteen, ['y'])).toEqual([])
  }
)

cases(
  'the phase line keeps its box through a reveal, a Re-vote and a vote',
  {},
  async ({ join, voters, role }) => {
    const { page, joined } = await fill(join, voters, role, 14)
    const read = async () => (await readBoxes(page, { phase: phaseLine(page) })).boxes
    await voteAllButOne(page, role, joined)
    const before = await read()
    await voteLast(page, role, joined)
    expect(moved(before, await read()), 'revealed').toEqual([])
    await page.getByRole('button', { name: 'Re-vote' }).click()
    await expect(phaseLine(page)).toHaveText('Voting')
    expect(moved(before, await read()), 'after Re-vote').toEqual([])
    await joined[0].vote(ESTIMATIONS[0])
    await expect(votedMark(table(page))).toHaveCount(1)
    expect(moved(before, await read()), 'after a vote').toEqual([])
  }
)

// On the real clock, since a fake one stops readBoxes' frames; the hint is read around the boxes.
cases(
  'a copy moves and covers nothing in the header or the round',
  {},
  async ({ join, voters, role, room }) => {
    const { page } = await fill(join, voters, role, 1)
    await expect(copyHint(page)).toHaveText('')
    await markRegion(copyHint(page))
    const copy = page.getByRole('link', { name: 'Copy link' })
    const named = {
      id: page.getByRole('heading', { name: room, exact: true }),
      copy,
      switch: switchTo(page, role === 'Voter' ? 'facilitator' : 'voter'),
      leave: page.getByRole('link', { name: 'Leave' }),
      phase: phaseLine(page),
      bar: roundBar(page),
      ...(role === 'Voter' && { slot: roundSlot(page) })
    }
    const before = (await readBoxes(page, named)).boxes
    await copy.click()
    await expect(copyHint(page)).toHaveText('Link copied')
    const { hint, ...after } = (await readBoxes(page, { ...named, hint: copyHint(page) })).boxes
    await expect(copyHint(page)).toHaveText('Link copied')
    expect(moved(before, after)).toEqual([])
    const covered = Object.keys(after).filter(name => overlap(hint, after[name]))
    expect(covered, JSON.stringify({ hint, ...after })).toEqual([])
    await expectLiveRegion(copyHint(page))
  }
)
